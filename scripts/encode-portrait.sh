#!/usr/bin/env bash
# encode-portrait.sh: turn the portrait clips loop.mp4 and greet.mp4 into the site's files, then check sizes
# and that the loop and the joins between clips have no jump (ADR-0008; the procedure of personal-brand's
# round-2 portrait-video/encode.md). Needs ffmpeg and ffprobe with libvpx-vp9 and libx264.
#
# Usage:
#   scripts/encode-portrait.sh --in <dir> --crop X,Y,W [options]    encode, check sizes and joins
#   scripts/encode-portrait.sh --in <dir> --first-frame <file.png>  save loop.mp4's first frame (to choose --crop)
#   scripts/encode-portrait.sh --check-only [--out <dir>]           re-run the size and join checks
#   scripts/encode-portrait.sh --self-test [--keep <dir>]           run everything on synthetic clips
#
# Inputs (local, never committed): <dir>/loop.mp4 (seamless idle loop, about 5 s) and optionally
# <dir>/greet.mp4 (greeting, 4 to 5 s). Both start and end on the same frame and have the same size.
#
# Options:
#   --in <dir>            folder with loop.mp4 and greet.mp4
#   --crop X,Y,W          crop box in source pixels; the height follows the poster's aspect (W * rows / cols)
#   --out <dir>           where the site files go (default public/portrait)
#   --cols N --rows N     the poster grid (default: read from src/assets/portrait/portrait.json); the clips are
#                         scaled to 2 * cols x 2 * rows, twice the dot grid the renderer samples
#   --webm-crf N          VP9 quality (default 42); raise by 2 while the WebM pair is over budget, at most 50
#   --mp4-crf N           H.264 quality (default 30); raise by 2 while the MP4 pair is over budget, at most 36
#   --budget-kb N         budget per format pair, loop + greet (default 150)
#   --trim-last loop|greet  drop the clip's last frame (when it repeats the first and holds the loop, step 7)
#   --poster-script <portrait.py>  also remake src/assets/portrait/portrait.json and the no-JS WebP from the
#                         loop's first frame, so the poster and the first video frame are the same picture
#   --gamma G --floor F --equalize | --no-equalize   tone for the poster (default: src/lib/portrait/config.ts,
#                         gamma 1.9, floor 5, equalize); config.ts must hold the same values
#   --jobs N              encodes run in parallel, N at a time (default 4: two clips x two formats)
#   --help
#
# Output: files portrait-loop.webm, portrait-loop.mp4, portrait-greet.webm, portrait-greet.mp4 in --out.
# Report on stdout (one "key value ..." line per measure, then "result pass|fail"); diagnostics on stderr.
# Exit 0 when every check passes, 1 when a size or join check fails, 2 on bad input (stop and ask the owner).
#
# The join check: the mean absolute luma difference (0-255) between two frames. A join (loop wrap, loop start
# to greet start, greet end to loop start) passes when it is no larger than the largest step between two
# consecutive frames inside the clips. A loop wrap under 0.05 while steps are over 0.2 means the last frame
# repeats the first: re-run with --trim-last loop.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
POSTER_JSON="$ROOT/src/assets/portrait/portrait.json"
IN="" OUT="$ROOT/public/portrait" CROP="" COLS="" ROWS="" WEBM_CRF=42 MP4_CRF=30 BUDGET_KB=150 JOBS=4
TRIM_LOOP=0 TRIM_GREET=0 POSTER_SCRIPT="" GAMMA=1.9 FLOOR=5 EQUALIZE=1 FIRST_FRAME="" CHECK_ONLY=0 SELF_TEST=0 KEEP=""
FPS=15

usage() { sed -n '2,/^$/p' "$0" | sed -e 's/^# \{0,1\}//' -e '/^set -euo/d'; }
die() { echo "encode-portrait: $*" >&2; exit 2; }
need() { [ $# -ge 2 ] && [ -n "$2" ] || die "$1 needs a value"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --in) need "$@"; IN="$2"; shift 2 ;;
    --out) need "$@"; OUT="$2"; shift 2 ;;
    --crop) need "$@"; CROP="$2"; shift 2 ;;
    --cols) need "$@"; COLS="$2"; shift 2 ;;
    --rows) need "$@"; ROWS="$2"; shift 2 ;;
    --webm-crf) need "$@"; WEBM_CRF="$2"; shift 2 ;;
    --mp4-crf) need "$@"; MP4_CRF="$2"; shift 2 ;;
    --budget-kb) need "$@"; BUDGET_KB="$2"; shift 2 ;;
    --trim-last) need "$@"; case "$2" in loop) TRIM_LOOP=1 ;; greet) TRIM_GREET=1 ;; *) die "--trim-last takes loop or greet" ;; esac; shift 2 ;;
    --poster-script) need "$@"; POSTER_SCRIPT="$2"; shift 2 ;;
    --gamma) need "$@"; GAMMA="$2"; shift 2 ;;
    --floor) need "$@"; FLOOR="$2"; shift 2 ;;
    --equalize) EQUALIZE=1; shift ;;
    --no-equalize) EQUALIZE=0; shift ;;
    --jobs) need "$@"; JOBS="$2"; shift 2 ;;
    --first-frame) need "$@"; FIRST_FRAME="$2"; shift 2 ;;
    --check-only) CHECK_ONLY=1; shift ;;
    --self-test) SELF_TEST=1; shift ;;
    --keep) need "$@"; KEEP="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option $1 (see --help)" ;;
  esac
done

command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null || die "ffmpeg and ffprobe are required"
isint() { case "$1" in ''|*[!0-9]*) return 1 ;; *) return 0 ;; esac; }
for v in "$WEBM_CRF" "$MP4_CRF" "$BUDGET_KB" "$JOBS"; do isint "$v" || die "not a whole number: $v"; done
[ "$JOBS" -ge 1 ] || die "--jobs must be at least 1"

TMP="$(mktemp -d "${TMPDIR:-/tmp}/encode-portrait.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

# ---------------------------------------------------------------- self-test on synthetic clips
if [ "$SELF_TEST" = 1 ]; then
  S="$TMP/self" && mkdir -p "$S/good" "$S/loop-only" "$S/jump" "$S/odd" "$S/out-good" "$S/out-loop" "$S/out-jump"
  # A seamless 5 s loop: a luma wave whose phase turns once in 5 s, so the frame after the last is the first.
  wave="128+80*sin(2*PI*(X/W+Y/(2*H)))"
  ffmpeg -v error -y -f lavfi -i "color=c=black:s=480x640:r=30:d=5,format=gray,geq=lum='128+80*sin(2*PI*(X/W+Y/(2*H)+T/5))'" \
    -c:v libx264 -crf 12 -pix_fmt yuv420p "$S/good/loop.mp4"
  # A 4 s greeting that starts and ends on the loop's first frame: a bright blob rises and falls over the wave.
  ffmpeg -v error -y -f lavfi -i "color=c=black:s=480x640:r=30:d=4,format=gray,geq=lum='clip($wave+90*sin(PI*T/4)*exp(-((X-W/2)*(X-W/2)+(Y-H/3)*(Y-H/3))/6000),0,255)'" \
    -c:v libx264 -crf 12 -pix_fmt yuv420p "$S/good/greet.mp4"
  # A loop with a jump at the wrap: the wave brightens for 3 s and snaps back to dark at the wrap.
  ffmpeg -v error -y -f lavfi -i "color=c=black:s=480x640:r=30:d=3,format=gray,geq=lum='clip(40+150*T/3+30*sin(2*PI*X/W),0,255)'" \
    -c:v libx264 -crf 12 -pix_fmt yuv420p "$S/jump/loop.mp4"
  cp "$S/good/greet.mp4" "$S/jump/greet.mp4"
  cp "$S/good/loop.mp4" "$S/loop-only/loop.mp4"
  # Clips of different sizes: the crop box cannot fit both.
  cp "$S/good/loop.mp4" "$S/odd/loop.mp4"
  ffmpeg -v error -y -f lavfi -i "testsrc2=s=320x240:r=30:d=1" -c:v libx264 -pix_fmt yuv420p "$S/odd/greet.mp4"

  fail=0
  run() { # expected-exit label args...
    local want="$1" label="$2"; shift 2
    local got=0
    "$0" "$@" >"$S/$label.out" 2>"$S/$label.err" || got=$?
    if [ "$got" = "$want" ]; then echo "self-test $label exit=$got ok"; else
      echo "self-test $label exit=$got expected=$want FAIL"; sed 's/^/  /' "$S/$label.out" "$S/$label.err" >&2; fail=1; fi
  }
  run 0 seamless --in "$S/good" --out "$S/out-good" --crop 40,40,400 --cols 110 --rows 131 --jobs "$JOBS"
  # Alone, the loop's wrap is held to the loop's own steps (the greeting's larger steps cannot hide it).
  run 0 seamless-loop-only --in "$S/loop-only" --out "$S/out-loop" --crop 40,40,400 --cols 110 --rows 131 --jobs "$JOBS"
  run 1 jump --in "$S/jump" --out "$S/out-jump" --crop 40,40,400 --cols 110 --rows 131 --jobs "$JOBS"
  run 2 size-mismatch --in "$S/odd" --out "$S/out-jump" --crop 40,40,400 --cols 110 --rows 131
  grep -q '^join loop-wrap .* fail$' "$S/jump.out" && echo "self-test jump reported at the loop wrap ok" \
    || { echo "self-test jump not reported at the loop wrap FAIL"; fail=1; }
  for f in portrait-loop.webm portrait-loop.mp4 portrait-greet.webm portrait-greet.mp4; do
    [ -s "$S/out-good/$f" ] || { echo "self-test missing $f FAIL"; fail=1; }
  done
  frames="$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$S/out-good/portrait-loop.webm")"
  [ "$frames" = 75 ] && echo "self-test loop keeps 75 frames (5 s at 15 fps) ok" || { echo "self-test loop has $frames frames, expected 75 FAIL"; fail=1; }
  sed 's/^/  seamless: /' "$S/seamless.out"
  sed -n -E 's/^(max-step|join)/  seamless-loop-only: \1/p' "$S/seamless-loop-only.out"
  if [ -n "$KEEP" ]; then mkdir -p "$KEEP" && cp "$S"/out-good/portrait-* "$KEEP"/ && echo "self-test clips kept in $KEEP"; fi
  [ "$fail" = 0 ] && echo "result pass" || echo "result fail"
  exit "$fail"
fi

[ -n "$COLS" ] && [ -n "$ROWS" ] || {
  [ -f "$POSTER_JSON" ] || die "no --cols/--rows and no $POSTER_JSON"
  read -r COLS ROWS < <(node -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(p.cols+" "+p.rows)' "$POSTER_JSON")
}
isint "$COLS" && isint "$ROWS" || die "cols and rows must be whole numbers"
OW=$((COLS * 2)) OH=$((ROWS * 2))

have_greet() { [ -f "$1/portrait-greet.webm" ] || [ -f "$1/portrait-greet.mp4" ]; }
size() { wc -c <"$1" | tr -d ' '; }
# Mean absolute luma difference between two stills.
ydiff() {
  ffmpeg -v error -i "$1" -i "$2" -lavfi "[0]format=gray[a];[1]format=gray[b];[a][b]blend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -f null - \
    | sed -n 's/.*YAVG=\([0-9.]*\).*/\1/p' | head -1
}
# Largest step between consecutive frames of a clip.
maxstep() {
  ffmpeg -v error -i "$1" -vf "format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-" -f null - \
    | sed -n 's/.*YAVG=\([0-9.]*\).*/\1/p' | sort -n | tail -1
}
le() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a <= b + 1e-9) }'; }

# ---------------------------------------------------------------- steps 6 and 7: sizes and joins
check() {
  local dir="$1" ok=0 budget=$((BUDGET_KB * 1024)) ext total f limit wrap s
  [ -f "$dir/portrait-loop.webm" ] || die "no $dir/portrait-loop.webm"
  for ext in webm mp4; do
    total=0
    for f in "$dir/portrait-loop.$ext" "$dir/portrait-greet.$ext"; do [ -f "$f" ] && total=$((total + $(size "$f"))); done
    if [ "$total" -le "$budget" ]; then s=ok; else s=fail; ok=1; fi
    echo "size $ext-pair $total bytes budget $budget $s"
  done
  for f in loop greet; do
    [ -f "$dir/portrait-$f.webm" ] || continue
    ffmpeg -v error -y -i "$dir/portrait-$f.webm" -vf "select=eq(n\,0)" -frames:v 1 "$TMP/$f-first.png"
    ffmpeg -v error -y -i "$dir/portrait-$f.webm" -vf reverse -frames:v 1 "$TMP/$f-last.png"
  done
  limit="$(maxstep "$dir/portrait-loop.webm")"
  echo "max-step loop $limit"
  if have_greet "$dir"; then
    s="$(maxstep "$dir/portrait-greet.webm")"
    echo "max-step greet $s"
    le "$s" "$limit" || limit="$s"
  fi
  echo "limit $limit"
  join() { # name a b
    local d; d="$(ydiff "$2" "$3")"
    if le "$d" "$limit"; then echo "join $1 $d ok"; else echo "join $1 $d fail"; ok=1; fi
  }
  join loop-wrap "$TMP/loop-last.png" "$TMP/loop-first.png"
  wrap="$(ydiff "$TMP/loop-last.png" "$TMP/loop-first.png")"
  if awk -v w="$wrap" -v l="$limit" 'BEGIN { exit !(w < 0.05 && l > 0.2) }'; then
    echo "advice the loop's last frame repeats its first; re-run with --trim-last loop" >&2
  fi
  if have_greet "$dir"; then
    join loop-to-greet "$TMP/loop-first.png" "$TMP/greet-first.png"
    join greet-to-loop "$TMP/greet-last.png" "$TMP/loop-first.png"
  fi
  return "$ok"
}

if [ "$CHECK_ONLY" = 1 ]; then
  if check "$OUT"; then echo "result pass"; exit 0; else echo "result fail"; exit 1; fi
fi

[ -n "$IN" ] || die "--in is required (see --help)"
[ -f "$IN/loop.mp4" ] || die "no $IN/loop.mp4"

if [ -n "$FIRST_FRAME" ]; then
  ffmpeg -v error -y -i "$IN/loop.mp4" -vf "select=eq(n\,0)" -frames:v 1 "$FIRST_FRAME"
  echo "first-frame $FIRST_FRAME"
  exit 0
fi

# ---------------------------------------------------------------- step 1: inspect
CLIPS="loop"
[ -f "$IN/greet.mp4" ] && CLIPS="loop greet"
dims=""
for f in $CLIPS; do
  info="$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,avg_frame_rate:format=duration -of default=nw=1 "$IN/$f.mp4" | tr '\n' ' ')"
  echo "clip $f $info"
  d="$(echo "$info" | sed -n 's/.*width=\([0-9]*\) height=\([0-9]*\).*/\1x\2/p')"
  [ -z "$dims" ] && dims="$d"
  [ "$d" = "$dims" ] || die "loop.mp4 is $dims and greet.mp4 is $d: one crop box cannot fit both. Stop and ask the owner."
done

# ---------------------------------------------------------------- step 2: the crop box
[ -n "$CROP" ] || die "--crop X,Y,W is required; save the first frame with --first-frame to choose it"
IFS=, read -r X Y W <<EOF
$CROP
EOF
for v in "$X" "$Y" "$W"; do isint "$v" || die "--crop takes X,Y,W in whole pixels"; done
H=$((W * ROWS / COLS))
SW="${dims%x*}" SH="${dims#*x}"
[ $((X + W)) -le "$SW" ] && [ $((Y + H)) -le "$SH" ] || die "crop $X,$Y,$W x $H does not fit the ${SW}x${SH} clips"
echo "crop portrait.py $X,$Y,$W,$H ffmpeg $W:$H:$X:$Y output ${OW}x${OH} ${FPS}fps"

# ---------------------------------------------------------------- step 3: the poster from the same frame
ffmpeg -v error -y -i "$IN/loop.mp4" -vf "select=eq(n\,0)" -frames:v 1 "$TMP/first-src.png"
if [ -n "$POSTER_SCRIPT" ]; then
  eq=""; [ "$EQUALIZE" = 1 ] && eq="--equalize"
  # shellcheck disable=SC2086
  uv run -q --with pillow "$POSTER_SCRIPT" --photo "$TMP/first-src.png" --crop "$X,$Y,$W,$H" --cols "$COLS" \
    $eq --gamma "$GAMMA" --floor "$FLOOR" --out "$POSTER_JSON"
  uv run -q --with pillow "$ROOT/scripts/portrait-fallback.py" --poster "$POSTER_JSON"
  echo "poster remade gamma $GAMMA floor $FLOOR equalize $EQUALIZE; src/lib/portrait/config.ts must hold the same tone"
else
  echo "poster not remade (no --poster-script): the poster and the first video frame may differ" >&2
fi

# ---------------------------------------------------------------- steps 4 and 5: encode, in parallel
mkdir -p "$OUT"
frames() { # clip -> frames at $FPS in one play of the source
  local dur; dur="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN/$1.mp4")"
  awk -v d="$dur" -v f="$FPS" 'BEGIN { printf "%d", d * f + 0.5 }'
}
# The loop is read twice and only the second pass is kept: the temporal denoiser (hqdn3d) then enters the
# first frame with the last frames as history, as a looping viewer sees it. Read once, the first frame has no
# history and differs from the smoothed frames around the wrap (on the synthetic loop the wrap step was 6.3
# against 4.5 for the other steps; primed, 4.5).
inargs() { if [ "$1" = loop ]; then echo "-stream_loop 1"; fi; }
vf() { # clip -> filter chain
  local n trim=""
  n="$(frames "$1")"
  if [ "$1" = loop ]; then
    if [ "$TRIM_LOOP" = 1 ]; then trim=",trim=start_frame=$n:end_frame=$((2 * n - 1))"; else trim=",trim=start_frame=$n"; fi
    trim="$trim,setpts=PTS-STARTPTS"
  elif [ "$TRIM_GREET" = 1 ]; then
    trim=",trim=end_frame=$((n - 1))"
  fi
  echo "crop=$W:$H:$X:$Y,hqdn3d=1.5:1.5:4:4,scale=$OW:$OH:flags=lanczos,fps=$FPS$trim,format=gray,format=yuv420p"
}
webm() {
  local f="$1" chain; chain="$(vf "$f")"
  # shellcheck disable=SC2046
  ffmpeg -hide_banner -v error -y $(inargs "$f") -i "$IN/$f.mp4" -an -vf "$chain" -c:v libvpx-vp9 -b:v 0 -crf "$WEBM_CRF" \
    -deadline good -cpu-used 1 -row-mt 1 -g 150 -pass 1 -passlogfile "$TMP/$f" -f null /dev/null
  # shellcheck disable=SC2046
  ffmpeg -hide_banner -v error -y $(inargs "$f") -i "$IN/$f.mp4" -an -vf "$chain" -c:v libvpx-vp9 -b:v 0 -crf "$WEBM_CRF" \
    -deadline good -cpu-used 1 -row-mt 1 -g 150 -pass 2 -passlogfile "$TMP/$f" "$OUT/portrait-$f.webm"
}
mp4() {
  local f="$1" chain; chain="$(vf "$f")"
  # shellcheck disable=SC2046
  ffmpeg -hide_banner -v error -y $(inargs "$f") -i "$IN/$f.mp4" -an -vf "$chain" -c:v libx264 -preset veryslow -crf "$MP4_CRF" \
    -profile:v high -pix_fmt yuv420p -g 150 -movflags +faststart "$OUT/portrait-$f.mp4"
}
# Every (clip, format) pair is independent; they run JOBS at a time (bash 3.2 has no `wait -n`, so in batches).
pids="" failed=0 running=0
for f in $CLIPS; do
  for kind in webm mp4; do
    "$kind" "$f" & pids="$pids $!"; running=$((running + 1))
    if [ "$running" -ge "$JOBS" ]; then for p in $pids; do wait "$p" || failed=1; done; pids="" running=0; fi
  done
done
for p in $pids; do wait "$p" || failed=1; done
[ "$failed" = 0 ] || { echo "encode-portrait: an encode failed (see above)" >&2; exit 2; }
for f in "$OUT"/portrait-*.webm "$OUT"/portrait-*.mp4; do [ -f "$f" ] && echo "file $(basename "$f") $(size "$f") bytes"; done

# ---------------------------------------------------------------- steps 6 and 7
if check "$OUT"; then echo "result pass"; exit 0; fi
echo "advice: a pair over budget: raise that format's CRF by 2 (VP9 at most 50, H.264 at most 36); a join over the limit: generate the clip again so it returns to the start frame" >&2
echo "result fail"
exit 1
