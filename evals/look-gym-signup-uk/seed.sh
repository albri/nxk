#!/usr/bin/env bash
# An independent gym in Cardiff and its membership sign-up page, as the owner asks nxk to look at it.
set -euo pipefail
git init -q
mkdir -p site
cat > README.md <<'EOF_SEED'
# Join page

The membership sign-up page for our independent gym in Cardiff. One membership: twelve-month contract, £29 a month,
£20 joining fee, paid by Direct Debit.
EOF_SEED
cat > site/join.html <<'EOF_SEED'
<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Join the gym | Membership sign-up</title>
  <meta name="description" content="Join our independent gym in Cardiff. £29 a month on a 12-month contract, £20 joining fee, paid by Direct Debit.">
  <style>
    :root {
      --bg: #f6f6f4;
      --card: #ffffff;
      --text: #1c1c1c;
      --muted: #5c5c5c;
      --line: #d9d9d4;
      --accent: #c8102e;
      --accent-dark: #9e0c24;
      --focus: #1a5fb4;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    main { max-width: 640px; margin: 0 auto; padding: 32px 16px 64px; }
    h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 8px; }
    h2 { font-size: 1.25rem; margin: 0 0 16px; }
    .lead { color: var(--muted); margin: 0 0 24px; }

    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 20px;
    }

    .price { display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px; }
    .price strong { font-size: 2.5rem; line-height: 1; }
    .summary { width: 100%; border-collapse: collapse; }
    .summary td { padding: 6px 0; border-top: 1px solid var(--line); }
    .summary td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
    .summary tr.total td { font-weight: 700; }

    fieldset { border: 0; padding: 0; margin: 0; }
    legend { padding: 0; }
    .field { margin-bottom: 16px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 480px) { .row { grid-template-columns: 1fr; } }

    label { display: block; font-weight: 600; margin-bottom: 4px; }
    .hint { display: block; font-weight: 400; color: var(--muted); font-size: 0.9rem; }
    input[type="text"], input[type="email"], input[type="tel"], input[type="date"] {
      width: 100%;
      padding: 10px 12px;
      font: inherit;
      border: 1px solid #8a8a85;
      border-radius: 4px;
      background: #fff;
    }
    input:focus, button:focus { outline: 3px solid var(--focus); outline-offset: 1px; }
    input:user-invalid { border-color: var(--accent); }
    .short { max-width: 12ch; }

    .check { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 14px; }
    .check input { width: 20px; height: 20px; margin: 2px 0 0; flex: none; }
    .check label { font-weight: 400; margin: 0; }

    .dd-guarantee { font-size: 0.9rem; border-left: 4px solid var(--line); padding-left: 12px; }
    .dd-guarantee ul { padding-left: 20px; margin: 8px 0 0; }
    .dd-guarantee li { margin-bottom: 6px; }

    button {
      width: 100%;
      padding: 14px;
      font: inherit;
      font-weight: 700;
      font-size: 1.1rem;
      color: #fff;
      background: var(--accent);
      border: 0;
      border-radius: 6px;
      cursor: pointer;
    }
    button:hover { background: var(--accent-dark); }
    .small { font-size: 0.875rem; color: var(--muted); }
    a { color: var(--focus); }
  </style>
</head>
<body>
<main>
  <h1>Join the gym</h1>
  <p class="lead">Independent gym in Cardiff. One simple membership, paid monthly by Direct Debit.</p>

  <section class="card" aria-labelledby="plan-heading">
    <h2 id="plan-heading">Your membership</h2>
    <div class="price"><strong>£29</strong><span>a month</span></div>
    <table class="summary">
      <tr><td>Joining fee (one-off, taken with your first payment)</td><td>£20.00</td></tr>
      <tr><td>Monthly fee</td><td>£29.00</td></tr>
      <tr><td>Minimum term</td><td>12 months</td></tr>
      <tr class="total"><td>Total over the 12-month minimum term</td><td>£368.00</td></tr>
    </table>
    <p class="small">All prices include VAT. After 12 months your membership continues month to month at the same price until you cancel.</p>
  </section>

  <!-- Bank details must be sent over HTTPS to your Direct Debit provider / Bacs bureau.
       Point the action at your server-side handler. -->
  <form action="/join" method="post" novalidate>
    <section class="card">
      <fieldset>
        <legend><h2>Your details</h2></legend>

        <div class="row">
          <div class="field">
            <label for="first-name">First name</label>
            <input type="text" id="first-name" name="first_name" autocomplete="given-name" required>
          </div>
          <div class="field">
            <label for="last-name">Last name</label>
            <input type="text" id="last-name" name="last_name" autocomplete="family-name" required>
          </div>
        </div>

        <div class="field">
          <label for="email">Email address</label>
          <input type="email" id="email" name="email" autocomplete="email" required>
        </div>

        <div class="row">
          <div class="field">
            <label for="phone">Mobile number</label>
            <input type="tel" id="phone" name="phone" autocomplete="tel" required>
          </div>
          <div class="field">
            <label for="dob">Date of birth</label>
            <input type="date" id="dob" name="date_of_birth" autocomplete="bday" required>
          </div>
        </div>

        <div class="field">
          <label for="address1">Address line 1</label>
          <input type="text" id="address1" name="address_line1" autocomplete="address-line1" required>
        </div>
        <div class="field">
          <label for="address2">Address line 2 <span class="hint">Optional</span></label>
          <input type="text" id="address2" name="address_line2" autocomplete="address-line2">
        </div>
        <div class="row">
          <div class="field">
            <label for="town">Town or city</label>
            <input type="text" id="town" name="town" autocomplete="address-level2" value="Cardiff" required>
          </div>
          <div class="field">
            <label for="postcode">Postcode</label>
            <input type="text" id="postcode" name="postcode" autocomplete="postal-code" class="short" required>
          </div>
        </div>

        <div class="field">
          <label for="start-date">When would you like to start?</label>
          <input type="date" id="start-date" name="start_date" required>
        </div>
      </fieldset>
    </section>

    <section class="card">
      <fieldset>
        <legend><h2>Direct Debit</h2></legend>
        <p class="small">Your first payment of £49.00 (£29 monthly fee + £20 joining fee) is taken on or shortly after your start date. After that, £29.00 is collected on the same date each month. We'll email you confirmation of your Direct Debit within 3 working days.</p>

        <div class="field">
          <label for="account-name">Name of account holder</label>
          <input type="text" id="account-name" name="account_holder" autocomplete="cc-name" required>
        </div>
        <div class="row">
          <div class="field">
            <label for="sort-code">Sort code <span class="hint">e.g. 12-34-56</span></label>
            <input type="text" id="sort-code" name="sort_code" inputmode="numeric" class="short"
                   pattern="\d{2}-?\d{2}-?\d{2}" maxlength="8" autocomplete="off" required>
          </div>
          <div class="field">
            <label for="account-number">Account number <span class="hint">8 digits</span></label>
            <input type="text" id="account-number" name="account_number" inputmode="numeric" class="short"
                   pattern="\d{8}" maxlength="8" autocomplete="off" required>
          </div>
        </div>

        <div class="check">
          <input type="checkbox" id="sole-signatory" name="sole_signatory" required>
          <label for="sole-signatory">I am the account holder and the only person required to authorise Direct Debits from this account.</label>
        </div>

        <div class="dd-guarantee">
          <strong>The Direct Debit Guarantee</strong>
          <ul>
            <li>The Guarantee is offered by all banks and building societies that accept instructions to pay Direct Debits.</li>
            <li>If there are any changes to the amount, date or frequency of your Direct Debit we will notify you 10 working days in advance of your account being debited or as otherwise agreed. If you request us to collect a payment, confirmation of the amount and date will be given to you at the time of the request.</li>
            <li>If an error is made in the payment of your Direct Debit, by us or your bank or building society, you are entitled to a full and immediate refund of the amount paid from your bank or building society.</li>
            <li>If you receive a refund you are not entitled to, you must pay it back when we ask you to.</li>
            <li>You can cancel a Direct Debit at any time by simply contacting your bank or building society. Written confirmation may be required. Please also notify us.</li>
          </ul>
        </div>
      </fieldset>
    </section>

    <section class="card">
      <fieldset>
        <legend><h2>Before you join</h2></legend>

        <p class="small">You have 14 days from the day you sign up to change your mind and get a full refund. If you start using the gym within those 14 days, we may deduct a proportionate amount for the days you used. After the cooling-off period, this is a 12-month minimum contract.</p>

        <div class="check">
          <input type="checkbox" id="terms" name="accept_terms" required>
          <label for="terms">I have read and agree to the <a href="/terms">membership terms and conditions</a>, including the 12-month minimum term.</label>
        </div>
        <div class="check">
          <input type="checkbox" id="health" name="health_declaration" required>
          <label for="health">I confirm I'm not aware of any medical reason that would make exercise unsafe for me, or I have checked with my GP.</label>
        </div>
        <div class="check">
          <input type="checkbox" id="marketing" name="marketing_opt_in">
          <label for="marketing">Email me about offers, classes and gym news. <span class="hint">Optional — unsubscribe any time.</span></label>
        </div>

        <p class="small">We use your details to manage your membership and collect payments. See our <a href="/privacy">privacy notice</a>.</p>
      </fieldset>

      <button type="submit">Join for £49 today, then £29 a month</button>
    </section>
  </form>
</main>

<script>
  // Default start date to today, and don't allow past dates.
  (function () {
    var start = document.getElementById('start-date');
    var today = new Date();
    var iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    start.min = iso;
    if (!start.value) start.value = iso;
  })();

  // Format sort code as 12-34-56 while typing.
  document.getElementById('sort-code').addEventListener('input', function (e) {
    var digits = e.target.value.replace(/\D/g, '').slice(0, 6);
    e.target.value = digits.replace(/(\d{2})(?=\d)/g, '$1-');
  });

  // Account number: digits only.
  document.getElementById('account-number').addEventListener('input', function (e) {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 8);
  });

  // Validate on submit and jump to the first problem.
  document.querySelector('form').addEventListener('submit', function (e) {
    if (!this.checkValidity()) {
      e.preventDefault();
      this.reportValidity();
    }
  });
</script>
</body>
</html>
EOF_SEED
