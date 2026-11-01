# SteelSeries Battery – Stream Deck Plugin

Shows battery level and charging state on Stream Deck keys and dials.

## Actions

- **Mouse Battery** (key): one mouse model, selectable in the settings.
- **Arctis GameBuds Battery** (key): left/right bud.
- **Battery Dial** (Stream Deck+ dial): rotate or tap the touch strip to cycle through all supported devices. Press the dial to refresh.

## Supported devices

- SteelSeries Aerox 5 Wireless (VID `0x1038`, PID `0x1852`, `0x185c`, `0x1860`)
- SteelSeries Arctis GameBuds (left/right bud, case charging state)

## Requirements

- Stream Deck software 7.1+
- Windows 10+ or macOS 12+

## Privacy & security

- Fully local: no network access, no telemetry.
- Only SteelSeries HID interfaces (VID `0x1038`) are opened, in non-exclusive mode.
- Only fixed battery-status requests are sent; no firmware or settings commands.
- Logs contain only plugin status messages.

## Build

```
npm install
npm run build
npx streamdeck validate com.cookienomster.steelseriesbatteryplugin.sdPlugin
npx streamdeck pack com.cookienomster.steelseriesbatteryplugin.sdPlugin
```

## Languages

English (default) and German. The language follows the Stream Deck app. To add a language, copy `en.json` to e.g. `fr.json` in the `.sdPlugin` folder and translate the values. For the settings panel, add the language to `SDPIComponents.i18n.locales` in `ui/*.html`.

## Selecting a model

Each button has a **Modell** dropdown in its settings. It lists all supported models; more are added on request.

## Requesting support for a new device

Open an issue and include the values below.

### Windows

1. Connect the device (for wireless devices: plug in the dongle and switch the device on).
2. Open PowerShell and run:
   ```powershell
   Get-PnpDevice -PresentOnly | Where-Object { $_.InstanceId -match 'VID_1038' } |
     Select-Object FriendlyName, InstanceId
   ```
3. `VID_1038` is the vendor ID (SteelSeries). `PID_xxxx` is the product ID. `MI_xx` is the interface number.

### Windows / macOS (with Node.js)

```
npm install
npx hid-showdevices
```

Copy every entry with `vendorId: 4152` (`0x1038`) and send these fields:
`productId`, `interface`, `usagePage`, `usage`, `product`.

### macOS (without Node.js)

System Information → USB → select the device → note **Product ID** and **Vendor ID**.

### Please also include

- Exact model name and whether it is wired or wireless (dongle or Bluetooth)
- Current battery percentage shown in the SteelSeries GG app (to verify the reading)

## Disclaimer

Not affiliated with or endorsed by SteelSeries. Protocol details were determined independently; use at your own risk.

## License

MIT
