#!/bin/bash
cd "S:/OneDrive/Desktop/GRID_Hackathon/Claude Code Setup" || exit 1
rm -f tmp/suite.log
for t in appendix business-chat map-lazy demo-readiness prototype-portfolio; do
  echo "== $t" >> tmp/suite.log
  timeout 590 node tests/e2e/$t.e2e.mjs > tmp/suite-$t.log 2>&1
  echo "exit $?  PASS lines: $(grep -c '^PASS' tmp/suite-$t.log)" >> tmp/suite.log
  grep "^FAIL\|check(s) failed\|All checks passed\|passed," tmp/suite-$t.log >> tmp/suite.log
done
echo ALLDONE >> tmp/suite.log
