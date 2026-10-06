# Source texts

Passages that posts can annotate. All are public domain.

| File | Text | Source |
| --- | --- | --- |
| `wcf.json` | Westminster Confession of Faith, as received by the Church of Scotland in 1647 | Kelty Kirk website text: the Free Presbyterian Church of Scotland edition (1995), corrected to the Edinburgh printing of 1647 |
| `scots.json` | Scots Confession, 1560 | Kelty Kirk website text: Knox's *History of the Reformation*, ed. William M'Gavin (1831) |
| `bsb.json` | Berean Standard Bible | [bible_databases](https://github.com/scrollmapper/bible_databases) |

In `wcf.json`, each chapter's `sections` array starts at section 1. In `scots.json`, `chapters` starts at chapter 1 and the preface is separate. Paragraphs within a section are separated by a blank line. The italics M'Gavin used for statute-book readings are not kept.

`bsb.json` lists books in canonical order; each chapter is an array of verse texts, starting at verse 1. An empty string marks a verse the BSB omits (for example Matthew 17:21).
