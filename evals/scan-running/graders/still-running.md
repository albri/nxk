---
type: llm
focus: last_message
weight: 2
---

PASS if the reply says the scan is still running (not finished), starts no other scan, and says when to check back.
FAIL if it reports results or groups from the scan, says it finished or failed, or starts another scan.
