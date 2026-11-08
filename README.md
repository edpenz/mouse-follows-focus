# Mouse Follows Focus

A GNOME Shell extension that moves the pointer when windows are snapped.
Useful in conjunction with the "Focus Follows Mouse" tweak.

## Requirements

- GNOME Shell 45 or newer

## Development

GNOME Shell only discovers newly installed extensions at startup,
 so on Wayland either log out and back in,
 or test in a nested shell without logging out:

```sh
make test-shell
```

## Layout

| Path | Purpose |
| --- | --- |
| `metadata.json` | Extension manifest read by GNOME Shell |
| `extension.js` | Entry point, `enable()`/`disable()` lifecycle |
| `prefs.js` | Preferences window |
| `schemas/` | GSettings schema |
| `stylesheet.css` | Extension styles |
