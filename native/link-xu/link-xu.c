/* native/link-xu/link-xu.c
 *
 * XU (UVC Extension Unit) helper for Insta360 Link / Link 2.
 *
 * Protocol values transcribed from the original project:
 *   https://github.com/vrwallace/Insta360-Link-1-and-2-Controller-for-Linux
 *   file uv4l2.pas (const block, lines ~117-178), reverse-engineered via
 *   Windows Kernel-Streaming property monitoring of the official app.
 *   Cross-referenced with linkctl.pas / uinsta360link.pas implementation.
 *   See docs/HARDWARE-TEST.md for the full provenance table.
 *
 *   XU Unit ID:            9   (main proprietary control unit)
 *   Selector 2  (52 bytes): master MODE control  -> AI tracking + scene modes
 *       byte[0] = mode ID, byte[1] = mode flag, byte[2..51] = 0
 *         Off/Normal   id=0x00 flag=0x00
 *         AI Tracking  id=0x01 flag=0x00
 *         Whiteboard   id=0x04 flag=0x01
 *         Overhead     id=0x05 flag=0x03
 *         DeskView     id=0x06 flag=0x10
 *   Selector 19 ( 1 byte ): AI tracking FRAMING  head=0x01 half=0x02 full=0x03
 *   Selector 14 ( 1 byte ): GIMBAL RESET, SET-only, payload 0x01
 *
 * NOTE on presets: the original project has NO hardware XU selector for
 * presets. Preset save/recall are implemented entirely in software (store
 * pan/tilt/zoom, re-apply via V4L2). This app does the same via its app-side
 * preset store. The `preset` subcommand here therefore has no authoritative XU
 * payload and intentionally does NOT send a fabricated ioctl.
 */
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <sys/ioctl.h>
#include <linux/uvcvideo.h>
#include <linux/usb/video.h>

/* Transcribed from vrwallace .../uv4l2.pas (see header + docs/HARDWARE-TEST.md). */
#define XU_UNIT_ID          9   /* main proprietary control unit */
#define XU_SEL_MODE         2   /* master mode control, 52-byte buffer */
#define XU_SEL_FRAMING      19  /* AI tracking framing, 1-byte value */
#define XU_SEL_RESET        14  /* gimbal reset, SET-only, 1 byte */
/* The master mode control (Selector 2) buffer length is model-specific and is
   queried from the device at runtime via UVC_GET_LEN (Link 1 reports 52,
   Link 2 reports 60, Link 2 Pro reports 61). Only byte[0]/byte[1] carry data;
   the remaining bytes are zero padding of whatever length the device wants. */
#define XU_MODE_BUFLEN_MAX  256

/* Mode IDs (Selector 2, byte[0]). */
#define XU_MODE_OFF         0x00
#define XU_MODE_AI          0x01
#define XU_MODE_WHITEBOARD  0x04
#define XU_MODE_OVERHEAD    0x05
#define XU_MODE_DESKVIEW    0x06
/* Mode flags (Selector 2, byte[1]). */
#define XU_FLAG_AI          0x00
#define XU_FLAG_WHITEBOARD  0x01
#define XU_FLAG_OVERHEAD    0x03
#define XU_FLAG_DESKVIEW    0x10

/* Framing values (Selector 19). */
#define XU_FRAME_HEAD       0x01
#define XU_FRAME_HALF_BODY  0x02
#define XU_FRAME_FULL_BODY  0x03

/* Send a SET_CUR to the XU. */
static int xu_set(const char *dev, uint8_t selector, const uint8_t *data, uint16_t len) {
    int fd = open(dev, O_RDWR);
    if (fd < 0) { fprintf(stderr, "open %s: %s\n", dev, strerror(errno)); return 2; }
    struct uvc_xu_control_query q;
    memset(&q, 0, sizeof(q));
    q.unit = XU_UNIT_ID;
    q.selector = selector;
    q.query = UVC_SET_CUR;
    q.size = len;
    q.data = (uint8_t *)data;
    int rc = ioctl(fd, UVCIOC_CTRL_QUERY, &q);
    if (rc < 0) fprintf(stderr, "ioctl UVCIOC_CTRL_QUERY (unit %u sel %u len %u): %s\n",
                        XU_UNIT_ID, selector, len, strerror(errno));
    close(fd);
    return rc < 0 ? 3 : 0;
}

/* Query the device-reported length (UVC_GET_LEN) of an XU control. Returns the
   length in bytes, or -1 on failure. */
static int xu_get_len(const char *dev, uint8_t selector) {
    int fd = open(dev, O_RDWR);
    if (fd < 0) { fprintf(stderr, "open %s: %s\n", dev, strerror(errno)); return -1; }
    uint8_t lenbuf[2] = { 0, 0 };
    struct uvc_xu_control_query q;
    memset(&q, 0, sizeof(q));
    q.unit = XU_UNIT_ID;
    q.selector = selector;
    q.query = UVC_GET_LEN;
    q.size = 2;
    q.data = lenbuf;
    int rc = ioctl(fd, UVCIOC_CTRL_QUERY, &q);
    close(fd);
    if (rc < 0) return -1;
    return lenbuf[0] | (lenbuf[1] << 8);
}

/* Master mode control: write [modeID, modeFlag] into a zeroed buffer sized to
   the device's own reported control length (model-specific: 52/60/61). */
static int xu_set_mode(const char *dev, uint8_t mode_id, uint8_t mode_flag) {
    int len = xu_get_len(dev, XU_SEL_MODE);
    if (len <= 1 || len > XU_MODE_BUFLEN_MAX) {
        fprintf(stderr, "xu_set_mode: bad GET_LEN for selector %d: %d\n", XU_SEL_MODE, len);
        return 3;
    }
    uint8_t buf[XU_MODE_BUFLEN_MAX];
    memset(buf, 0, (size_t)len);
    buf[0] = mode_id;
    buf[1] = mode_flag;
    return xu_set(dev, XU_SEL_MODE, buf, (uint16_t)len);
}

static void usage(void) {
    printf("usage: link-xu <dev> <command>\n"
           "  ai on|off\n  framing head|half|full\n"
           "  scene normal|deskview|whiteboard|overhead\n"
           "  preset recall|save <1-6>   (software-only; not an XU op)\n"
           "  reset\n");
}

int main(int argc, char **argv) {
    if (argc == 2 && strcmp(argv[1], "--help") == 0) { usage(); return 0; }
    if (argc < 3) { usage(); return 1; }
    const char *dev = argv[1];
    const char *cmd = argv[2];

    /* AI tracking: master mode control (Selector 2). */
    if (strcmp(cmd, "ai") == 0 && argc == 4) {
        if (strcmp(argv[3], "on") == 0)
            return xu_set_mode(dev, XU_MODE_AI, XU_FLAG_AI);
        if (strcmp(argv[3], "off") == 0)
            return xu_set_mode(dev, XU_MODE_OFF, 0);
        fprintf(stderr, "ai expects on|off\n");
        return 1;
    }

    /* Framing: Selector 19, single byte. */
    if (strcmp(cmd, "framing") == 0 && argc == 4) {
        uint8_t v;
        if (strcmp(argv[3], "head") == 0)      v = XU_FRAME_HEAD;
        else if (strcmp(argv[3], "half") == 0) v = XU_FRAME_HALF_BODY;
        else if (strcmp(argv[3], "full") == 0) v = XU_FRAME_FULL_BODY;
        else { fprintf(stderr, "framing expects head|half|full\n"); return 1; }
        return xu_set(dev, XU_SEL_FRAMING, &v, 1);
    }

    /* Scene modes: master mode control (Selector 2). */
    if (strcmp(cmd, "scene") == 0 && argc == 4) {
        if (strcmp(argv[3], "normal") == 0)
            return xu_set_mode(dev, XU_MODE_OFF, 0);
        if (strcmp(argv[3], "deskview") == 0)
            return xu_set_mode(dev, XU_MODE_DESKVIEW, XU_FLAG_DESKVIEW);
        if (strcmp(argv[3], "whiteboard") == 0)
            return xu_set_mode(dev, XU_MODE_WHITEBOARD, XU_FLAG_WHITEBOARD);
        if (strcmp(argv[3], "overhead") == 0)
            return xu_set_mode(dev, XU_MODE_OVERHEAD, XU_FLAG_OVERHEAD);
        fprintf(stderr, "scene expects normal|deskview|whiteboard|overhead\n");
        return 1;
    }

    /* Presets: no authoritative XU selector exists (see file header).
       The original project implements these purely in software, and this app
       does likewise via its app-side preset store. Do not fabricate an ioctl. */
    if (strcmp(cmd, "preset") == 0 && argc == 5) {
        int slot = atoi(argv[4]);
        if (slot < 1 || slot > 6) { fprintf(stderr, "slot out of range\n"); return 1; }
        fprintf(stderr,
                "preset %s: the Insta360 Link has no hardware XU preset control; "
                "presets are handled app-side (software pan/tilt/zoom). "
                "This is not an XU operation.\n", argv[3]);
        return 4; /* distinct exit code: unsupported-at-XU-layer, not a protocol error */
    }

    /* Gimbal reset: Selector 14, single byte 0x01.
       (The full "home" behaviour also sets V4L2 pan/tilt to 0; that part is the
       v4l2 adapter's job — this helper only issues the XU reset trigger.) */
    if (strcmp(cmd, "reset") == 0) {
        uint8_t v = 0x01;
        return xu_set(dev, XU_SEL_RESET, &v, 1);
    }

    usage();
    return 1;
}
