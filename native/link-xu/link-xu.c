/* native/link-xu/link-xu.c */
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

/* XU unit id and selector — VERIFY against original uinsta360link.pas (Task 15). */
#define XU_UNIT_ID 4

/* Send a SET_CUR to the XU. selector + payload come from the command tables below. */
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
    if (rc < 0) fprintf(stderr, "ioctl UVCIOC_CTRL_QUERY: %s\n", strerror(errno));
    close(fd);
    return rc < 0 ? 3 : 0;
}

static void usage(void) {
    printf("usage: link-xu <dev> <command>\n"
           "  ai on|off\n  framing head|half|full\n"
           "  scene normal|deskview|whiteboard|overhead\n"
           "  preset recall|save <1-6>\n  reset\n");
}

/* ---- Command payload tables: FILL IN verified selectors/bytes (Task 15) ----
   Each entry is {selector, {bytes...}, len}. Placeholders are marked TODO-HW
   and MUST be replaced with values transcribed from the original project. */

int main(int argc, char **argv) {
    if (argc == 2 && strcmp(argv[1], "--help") == 0) { usage(); return 0; }
    if (argc < 3) { usage(); return 1; }
    const char *dev = argv[1];
    const char *cmd = argv[2];

    /* NOTE: selector/payload values below are structural placeholders.
       Task 15 replaces each xu_set(...) payload with hardware-verified bytes. */
    if (strcmp(cmd, "ai") == 0 && argc == 4) {
        uint8_t on = strcmp(argv[3], "on") == 0 ? 1 : 0;
        uint8_t data[2] = { /*TODO-HW selector-specific*/ on, 0 };
        return xu_set(dev, /*TODO-HW selector*/ 0x01, data, sizeof(data));
    }
    if (strcmp(cmd, "framing") == 0 && argc == 4) {
        uint8_t m = strcmp(argv[3], "head") == 0 ? 0 : strcmp(argv[3], "half") == 0 ? 1 : 2;
        uint8_t data[2] = { m, 0 };
        return xu_set(dev, /*TODO-HW selector*/ 0x02, data, sizeof(data));
    }
    if (strcmp(cmd, "scene") == 0 && argc == 4) {
        uint8_t s = !strcmp(argv[3],"normal")?0:!strcmp(argv[3],"deskview")?1:!strcmp(argv[3],"whiteboard")?2:3;
        uint8_t data[2] = { s, 0 };
        return xu_set(dev, /*TODO-HW selector*/ 0x03, data, sizeof(data));
    }
    if (strcmp(cmd, "preset") == 0 && argc == 5) {
        int slot = atoi(argv[4]);
        if (slot < 1 || slot > 6) { fprintf(stderr, "slot out of range\n"); return 1; }
        uint8_t save = strcmp(argv[3], "save") == 0 ? 1 : 0;
        uint8_t data[2] = { (uint8_t)slot, save };
        return xu_set(dev, /*TODO-HW selector*/ 0x04, data, sizeof(data));
    }
    if (strcmp(cmd, "reset") == 0) {
        uint8_t data[1] = { 1 };
        return xu_set(dev, /*TODO-HW selector*/ 0x05, data, sizeof(data));
    }
    usage();
    return 1;
}
