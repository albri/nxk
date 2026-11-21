#!/usr/bin/env bash
# A bike shop in Bristol that sells in the shop and online, and its refunds page, as the owner asks nxk to look at it.
set -euo pipefail
git init -q
mkdir -p site
cat > README.md <<'EOF_SEED'
# Spokes & Co website

Our bike shop on Gloucester Road, Bristol. We sell bikes, parts and kit in the shop and online, and post across the UK.
EOF_SEED
cat > site/refunds.html <<'EOF_SEED'
<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <title>Refunds and returns | Spokes &amp; Co</title>
</head>
<body>
  <h1>Refunds and returns</h1>
  <p>Spokes &amp; Co, 14 Gloucester Road, Bristol. Bikes, parts and kit, in the shop and online.</p>

  <h2>Bought in the shop</h2>
  <p>Changed your mind? Bring it back within 14 days with your receipt, unused and in its packaging.</p>

  <h2>Bought online</h2>
  <p>You can cancel within 14 days of delivery. Email returns@spokesandco.co.uk with your order number, then send it
  back within 14 days. Return postage is yours to pay unless it is faulty. We refund you within 14 days of getting it
  back.</p>

  <h2>Faulty items</h2>
  <p>Tell us within 30 days and we'll give you a full refund. After that, we'll repair or replace it.</p>

  <h2>What we can't take back</h2>
  <p>Wheels we've built to your measurements, unless they're faulty.</p>

  <h2>How you're refunded</h2>
  <p>Refunds go back the way you paid: to your card, or in cash if you paid cash.</p>
</body>
</html>
EOF_SEED
