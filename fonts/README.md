# Bundled fonts

Any font file (`.ttf`, `.otf`, `.woff`, `.woff2`) dropped in this directory
appears in the label editor's font picker — the filename (minus extension,
with `_`/`-` read as spaces) becomes the family name shown. No rebuild
needed; the server scans this directory on each `GET /api/fonts`.

The bundled set (licenses in `licenses/`):

| Font | Role | License | Source |
|---|---|---|---|
| Inter | clean sans-serif | OFL 1.1 | google/fonts |
| Lora | serif | OFL 1.1 | google/fonts |
| JetBrains Mono | monospace | OFL 1.1 | google/fonts |
| Oswald | condensed | OFL 1.1 | google/fonts |
| Archivo Black | heavy display (Impact-ish) | OFL 1.1 | google/fonts |
| Caveat | handwriting | OFL 1.1 | google/fonts |
| Comic Neue | Comic Sans, but respectable | OFL 1.1 | google/fonts |
| Routed Gothic (+ Wide) | vintage drafting/engraving lettering | OFL 1.1 | [dse/routed-gothic](https://github.com/dse/routed-gothic) |
| Open Gorton (+ Bold) | Gorton engraving/keycap lettering | MIT | [dakotafelder/open-gorton](https://github.com/dakotafelder/open-gorton) |
