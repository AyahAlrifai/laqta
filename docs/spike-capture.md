# Capture spike results (T-004)

**Status: not run yet.** This needs the Windows and macOS test machines in the manual matrix (spec section 12).

For each case, run `pnpm dev`, press the hotkey, select an area and check the saved crop. The app logs
`capture.complete` with the pixel size, and the size pill shows image pixels.

| Case                                                              | Windows 10 | Windows 11 | macOS current | macOS previous |
| ----------------------------------------------------------------- | ---------- | ---------- | ------------- | -------------- |
| 100 % scaling, one monitor: crop pixel size = selection × scale   |            |            |               |                |
| 150 % or Retina: frame size = display size × scaleFactor (item 7) |            |            |               |                |
| Two monitors, different scale factors                             |            |            |               |                |
| Selection pixels equal the source pixels                          |            |            |               |                |
| Overlay above a full-screen app (item 8)                          |            |            |               |                |
| Window mode bounds within 2 px (item 9, get-windows)              |            |            |               |                |
| Protected window shows a clear result                             |            |            |               |                |
| Screen Recording denied shows the permission guide                |            |            |               |                |
| safeStorage available (item 11)                                   |            |            |               |                |

Record pass or fail per cell, and add screenshots that contain no sensitive data.

Already verified automatically (E2E, macOS, synthetic frames): overlay selection, Enter to continue,
crop through `NativeImage.crop`, workbench opens with the crop.
