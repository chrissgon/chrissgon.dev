# Changelog


## v1.0.0

[compare changes](https://github.com/chrissgon/chrissgon.dev/compare/2dc8e2bdf2091b11e59ab00d4e9777c44fbc718d...v1.0.0)

### 🚀 Enhancements

- Site foundation with the data module, llms.txt, JSON-LD and the repository baseline ([2dc8e2b](https://github.com/chrissgon/chrissgon.dev/commit/2dc8e2b))
- **mcp:** Read-only MCP server at /api/mcp as a Netlify Function ([#5](https://github.com/chrissgon/chrissgon.dev/pull/5))
- Approved content, project images, build-time skill count and the ADR-0009 checks ([#6](https://github.com/chrissgon/chrissgon.dev/pull/6))
- Dot portrait island on the home hero and self-hosted fonts ([#7](https://github.com/chrissgon/chrissgon.dev/pull/7))
- **design:** Direction A layout and home page ([#10](https://github.com/chrissgon/chrissgon.dev/pull/10))
- **design:** Projects, writing and lab pages in direction A ([#11](https://github.com/chrissgon/chrissgon.dev/pull/11))
- **design:** Home, projects, writing and lab to the Claude Design home ([#14](https://github.com/chrissgon/chrissgon.dev/pull/14))
- **cards:** Generated dot patterns for image-less project covers; covers 25% shorter ([#16](https://github.com/chrissgon/chrissgon.dev/pull/16))
- **portrait:** The portrait loop clip, with a poster from its first frame ([#15](https://github.com/chrissgon/chrissgon.dev/pull/15))
- **posts:** 9:16 post covers, cropped at build ([#17](https://github.com/chrissgon/chrissgon.dev/pull/17))
- **hero:** No divider, a larger portrait that stays whole on scroll ([#19](https://github.com/chrissgon/chrissgon.dev/pull/19))
- **posts:** 4:5 post covers instead of 9:16 ([#20](https://github.com/chrissgon/chrissgon.dev/pull/20))
- **hero:** A smaller portrait in two equal columns ([#21](https://github.com/chrissgon/chrissgon.dev/pull/21))
- **hero:** The whole install command at every width, a smaller portrait ([#22](https://github.com/chrissgon/chrissgon.dev/pull/22))
- **hero:** On phones the portrait is the hero's background, with no line ([#23](https://github.com/chrissgon/chrissgon.dev/pull/23))
- **numbers:** Slower count-up, staggered, with no layout shift ([#24](https://github.com/chrissgon/chrissgon.dev/pull/24))
- **projects:** Drawn covers for the four projects in progress ([#26](https://github.com/chrissgon/chrissgon.dev/pull/26))
- **trajectory:** The last entry is just Now, with Perfect UI and ai-workbench ([#29](https://github.com/chrissgon/chrissgon.dev/pull/29))
- **background:** The page's grid dots step aside from the pointer, like the portrait's ([#30](https://github.com/chrissgon/chrissgon.dev/pull/30))
- **background:** A bigger push for the page's grid dots ([#31](https://github.com/chrissgon/chrissgon.dev/pull/31))
- **brand:** Logo 4a favicons, header symbol and share images ([#33](https://github.com/chrissgon/chrissgon.dev/pull/33))
- **projects:** Meuespresso and rickandmorty back on the site; manifest content type ([#34](https://github.com/chrissgon/chrissgon.dev/pull/34))
- **agent-view:** The "view as agent" switch on every page ([#35](https://github.com/chrissgon/chrissgon.dev/pull/35))
- **home:** "Pick the next post" section; GitHub links for three projects in progress ([#36](https://github.com/chrissgon/chrissgon.dev/pull/36))
- **lab:** Perfectui-live becomes a playground with a sandboxed live preview ([#37](https://github.com/chrissgon/chrissgon.dev/pull/37))
- **pick:** Show each topic's count of picks in "Pick the next post" ([#40](https://github.com/chrissgon/chrissgon.dev/pull/40))
- **posts:** The post under the pointer grows and the others dim ([#41](https://github.com/chrissgon/chrissgon.dev/pull/41))
- **posts:** The other posts dim to 0.3; no scale and no border change ([#42](https://github.com/chrissgon/chrissgon.dev/pull/42))
- **pick:** "Pick the next post" uses the section's full width ([#43](https://github.com/chrissgon/chrissgon.dev/pull/43))

### 🔥 Performance

- **portrait:** Paint video frames in bands so no frame is a long task ([#12](https://github.com/chrissgon/chrissgon.dev/pull/12))

### 🩹 Fixes

- Stop the build when the JSON-LD Person carries a forbidden field ([#3](https://github.com/chrissgon/chrissgon.dev/pull/3))
- **portrait:** Draw the poster once on load; no intro in the hero ([#9](https://github.com/chrissgon/chrissgon.dev/pull/9))
- **check-dist:** Count inline-style fonts; docs: lighthouse is a required check ([#8](https://github.com/chrissgon/chrissgon.dev/pull/8))
- **layout:** No horizontal scroll from 320 to 1920 px; layout sweep in CI ([#18](https://github.com/chrissgon/chrissgon.dev/pull/18))
- Code wraps instead of scrolling sideways, site-wide ([#25](https://github.com/chrissgon/chrissgon.dev/pull/25))
- **layout:** Grids of bordered cells stay closed when a row is incomplete ([#27](https://github.com/chrissgon/chrissgon.dev/pull/27))
- **hero:** No min-height, so the content sets a shorter hero ([#28](https://github.com/chrissgon/chrissgon.dev/pull/28))
- **home:** View as agent shows only the reading; the products divider runs the section's full height ([#32](https://github.com/chrissgon/chrissgon.dev/pull/32))
- **projects:** Perfect UI for agents links to chrissgon/perfectui-mcp ([#38](https://github.com/chrissgon/chrissgon.dev/pull/38))
- **projects:** Perfect UI for agents, Agent-ready kit and Light-site auditor are ready ([#39](https://github.com/chrissgon/chrissgon.dev/pull/39))

### 🤖 CI

- **lighthouse:** Discard a warm-up run per page and gate on the median of 5 ([#13](https://github.com/chrissgon/chrissgon.dev/pull/13))

