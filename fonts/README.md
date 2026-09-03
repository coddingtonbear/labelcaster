# Bundled fonts

Any font file (`.ttf`, `.otf`, `.woff`, `.woff2`) dropped in this directory
appears in the label editor's font picker — the filename (minus extension,
with `_`/`-` read as spaces) becomes the family name shown. No rebuild
needed; the server scans this directory on each `GET /api/fonts`.

The bundled set, all licensed under the SIL Open Font License 1.1
(see `licenses/`), from <https://github.com/google/fonts>:

| Font | Role |
|---|---|
| Inter | clean sans-serif |
| Lora | serif |
| JetBrains Mono | monospace |
| Oswald | condensed |
| Archivo Black | heavy display (Impact-ish) |
| Caveat | handwriting |
| Comic Neue | Comic Sans, but respectable |
