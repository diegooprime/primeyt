# PrimeYT

My custom YouTube client. Vim keybinds, One Dark theme, no algorithmic noise.

YouTube is designed to keep you watching. I want to watch what I chose to watch, then leave. This strips it down to subscriptions, watch later, and keyboard control.

## Demo

[screenshot/gif]

## How it works

**Feed navigation**

| Key | Action |
|-----|--------|
| `j/k` | Next/prev video |
| `H` | Back |
| `Enter` | Open video |
| `Shift+Enter` | Open in new tab |
| `g` | Top |
| `/` | Filter videos |
| `n/N` | Next/prev match |
| `Esc` | Clear |

**Watch page**

| Key | Action |
|-----|--------|
| `j/l` | Seek -10s/+10s |
| `k` | Like |
| `t` | Theater mode |
| `m` | Mute |
| `c` | Captions |
| `s` | Copy link |
| `w` | Watch Later |

**Leader commands** (press `Space` first)

| Keys | Action |
|------|--------|
| `f f` | Search |
| `s` | Subscriptions |
| `w` | Watch Later |
| `p` | YouTube Studio |
| `r` | Home |
| `l` | Forward |
| `?` | Help |

**Removed:** homepage recommendations, shorts (everywhere), comments, sidebar recommendations, end cards, premium upsells, category chips, mini player, notification bell, guide sidebar.

**Auto behaviors:** theater mode on open, shorts redirect to regular player, share links stripped of tracking params.

**Stats widget:** tracks my watch time (24h/7d). Keeps me honest.

## Install

```bash
git clone [repo]
# chrome://extensions/ → Developer mode → Load unpacked → select folder
```

## License

MIT
