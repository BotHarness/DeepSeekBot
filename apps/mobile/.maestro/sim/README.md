# Simulator flows with a live Host

These flows need values from a running Host, so `maestro test .maestro` (which only runs the top-level flows) skips them. `node scripts/e2e-mobile-sim.mjs` runs them in order against two isolated Hosts. Each flow names the `-e` variables it reads.
