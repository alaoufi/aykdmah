# Vivid theme snapshot

These four files are the ORIGINAL high-saturation versions of every
theme, kept as a one-click revert path in case the softer (current)
versions don't feel right.

To roll back: copy the file you want back into `../themes/` and rebuild.

Example:
```
cp themes_vivid_backup/rajhi.js themes/rajhi.js
```

Or restore everything:
```
cp themes_vivid_backup/{default,dark,ocean,rajhi}.js themes/
```

No imports here — this folder is invisible to the theme registry.
