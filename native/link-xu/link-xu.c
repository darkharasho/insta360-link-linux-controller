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

/* ---- Generic extension-unit access (used for the Elgato Facecam 4K) ------
 * The unit ID is a runtime argument here: callers resolve it by GUID from the
 * USB descriptors. Which selectors may be written is decided by the app's
 * allowlist (src/main/camera/facecam-map.ts); this helper only refuses
 * payloads whose size disagrees with the device's GET_LEN. */
#define XU_GENERIC_MAX 4096

static int xq(int fd, uint8_t unit, uint8_t sel, uint8_t query, uint8_t *buf, uint16_t len) {
    struct uvc_xu_control_query q;
    memset(&q, 0, sizeof(q));
    q.unit = unit; q.selector = sel; q.query = query; q.size = len; q.data = buf;
    return ioctl(fd, UVCIOC_CTRL_QUERY, &q);
}

static void print_hex(const char *key, const uint8_t *b, int len) {
    printf(" %s=", key);
    for (int i = 0; i < len; i++) printf("%02x", b[i]);
}

static int parse_u8(const char *s, uint8_t *out) {
    char *end;
    long v = strtol(s, &end, 10);
    if (*s == '\0' || *end != '\0' || v < 0 || v > 255) return -1;
    *out = (uint8_t)v;
    return 0;
}

static int xu_generic_get(const char *dev, const char *unit_s, const char *sels) {
    uint8_t unit;
    if (parse_u8(unit_s, &unit) < 0) { fprintf(stderr, "bad unit %s\n", unit_s); return 1; }
    int fd = open(dev, O_RDWR);
    if (fd < 0) { fprintf(stderr, "open %s: %s\n", dev, strerror(errno)); return 2; }
    static uint8_t buf[XU_GENERIC_MAX];
    char list[512];
    snprintf(list, sizeof(list), "%s", sels);
    for (char *tok = strtok(list, ","); tok; tok = strtok(NULL, ",")) {
        uint8_t sel;
        if (parse_u8(tok, &sel) < 0) { printf("sel=%s err=bad selector\n", tok); continue; }
        uint8_t lb[2] = { 0, 0 }, info = 0;
        if (xq(fd, unit, sel, UVC_GET_LEN, lb, 2) < 0) { printf("sel=%u err=%s\n", sel, strerror(errno)); continue; }
        int len = lb[0] | (lb[1] << 8);
        if (xq(fd, unit, sel, UVC_GET_INFO, &info, 1) < 0) { printf("sel=%u err=%s\n", sel, strerror(errno)); continue; }
        printf("sel=%u len=%d info=%02x", sel, len, info);
        if ((info & 0x01) && len > 0 && len <= XU_GENERIC_MAX) {
            static const struct { uint8_t q; const char *k; } qs[] = {
                { UVC_GET_CUR, "cur" }, { UVC_GET_MIN, "min" }, { UVC_GET_MAX, "max" }, { UVC_GET_DEF, "def" },
            };
            for (int i = 0; i < 4; i++) {
                if (i > 0 && len > 16) break;
                memset(buf, 0, (size_t)len);
                if (xq(fd, unit, sel, qs[i].q, buf, (uint16_t)len) < 0) {
                    if (i == 0) { printf(" err=%s", strerror(errno)); break; }
                    continue;
                }
                print_hex(qs[i].k, buf, len);
            }
        }
        printf("\n");
    }
    close(fd);
    return 0;
}

static int xu_generic_set(const char *dev, const char *unit_s, const char *sel_s, const char *hex) {
    uint8_t unit, sel;
    if (parse_u8(unit_s, &unit) < 0 || parse_u8(sel_s, &sel) < 0) { fprintf(stderr, "bad unit/selector\n"); return 1; }
    size_t hl = strlen(hex);
    if (hl == 0 || hl % 2 || hl / 2 > XU_GENERIC_MAX) { fprintf(stderr, "bad hex payload\n"); return 1; }
    static uint8_t buf[XU_GENERIC_MAX];
    for (size_t i = 0; i < hl / 2; i++) {
        unsigned v;
        if (sscanf(hex + 2 * i, "%2x", &v) != 1) { fprintf(stderr, "bad hex payload\n"); return 1; }
        buf[i] = (uint8_t)v;
    }
    int fd = open(dev, O_RDWR);
    if (fd < 0) { fprintf(stderr, "open %s: %s\n", dev, strerror(errno)); return 2; }
    uint8_t lb[2] = { 0, 0 };
    if (xq(fd, unit, sel, UVC_GET_LEN, lb, 2) < 0) {
        fprintf(stderr, "GET_LEN unit %u sel %u: %s\n", unit, sel, strerror(errno)); close(fd); return 3;
    }
    int len = lb[0] | (lb[1] << 8);
    if ((size_t)len != hl / 2) {
        fprintf(stderr, "payload is %zu bytes, control wants %d\n", hl / 2, len); close(fd); return 1;
    }
    int rc = xq(fd, unit, sel, UVC_SET_CUR, buf, (uint16_t)len);
    if (rc < 0) fprintf(stderr, "SET_CUR unit %u sel %u: %s\n", unit, sel, strerror(errno));
    close(fd);
    return rc < 0 ? 3 : 0;
}

static void usage(void) {
    printf("usage: link-xu <dev> <command>\n"
           "  ai on|off\n  framing head|half|full\n"
           "  scene normal|deskview|whiteboard|overhead\n"
           "  reset\n"
           "  xu-get <unit> <sel>[,<sel>...]   (read-only GET_* queries)\n"
           "  xu-set <unit> <sel> <hex>\n");
}

int main(int argc, char **argv) {
    if (argc == 2 && strcmp(argv[1], "--help") == 0) { usage(); return 0; }
    if (argc < 3) { usage(); return 1; }
    const char *dev = argv[1];
    const char *cmd = argv[2];

    if (strcmp(cmd, "xu-get") == 0 && argc == 5) return xu_generic_get(dev, argv[3], argv[4]);
    if (strcmp(cmd, "xu-set") == 0 && argc == 6) return xu_generic_set(dev, argv[3], argv[4], argv[5]);

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
