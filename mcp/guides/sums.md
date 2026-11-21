# The sums

The business's side of a choice, in money. None of this needs a
spreadsheet: a few lines of arithmetic, written out so that the owner can check
them and put in their own figures.

## Start with the chain

Write the path from first sight to money as a chain of shares, and put a low
and a high figure on each link you do not know:

```text
people who reach the point
  x share who start          (the step you are designing)
  x share who go on to pay
  x price per period
  x periods they stay
  - cost to serve them
```

Say where each figure comes from: given in the request, a usual figure for
this kind of product, or a guess. Mark the guesses. Use what usually happens
as the starting point: a free trial that needs no card is started by many
more people and converts a small share of them; one that needs a card is
started by far fewer and converts most. Quote a range, not a point.

## Compare options by their break-even

Do not try to predict revenue. Find the point at which the two options earn
the same, and ask which side of it the business is likely to be on. Let the
calculator do the arithmetic: in testing, every break-even worked out by hand
had a mistake in it.

`sums` with:

```json
{"options": ["Card first: visitors=1000, start=4%, pay=60%, price=4.99, months=8", "Email only: visitors=1000, start=12%, pay=?, price=4.99, months=8"]}
```

```text
Break-even: Email only equals Card first when pay is 20.0%. Above that, Email only is ahead.
Check: Email only with pay at 20.0% = 958; Card first = 958.
```

Each option is a chain of figures that multiply. Put `?` for the one figure
you want solved, and a range such as `30%..50%` for a figure you are unsure
of. State the result as a sentence: "the email-only trial wins if at least 1
in 5 of the people who start it go on to pay." It tells the reader which
single number to go and find out, and it survives their figures being
different from yours.

## Find the figure the answer hangs on

Give every uncertain figure as a range and no `?`. The calculator then says
which option is ahead at the middle of the ranges, and names any figure whose
range contains the point where the choice changes. Usually one figure decides
it and the rest do not matter. That figure is what to ask the owner for, or
count, now, and what to measure first after launch.

## Count beyond the first payment

- **Staying.** Revenue is price times how long people stay. An option that
  brings in people who leave after a month can lose to one that brings in
  fewer who stay. Work out the months a customer must stay to repay what it
  cost to win them.
- **Refunds, complaints and chargebacks.** A charge the person did not expect
  is not revenue until it survives the refund request. Take a share off.
- **Who the lost people are.** Take from `suggest` which kinds of person an
  option rules out and how many of every 100 of the audience. Losing a kind who
  would never have paid costs nothing; losing the kind most likely to pay and
  stay costs more than their numbers suggest.
- **Quote only what the calculator printed.** It checks each break-even by
  putting it back into both options. A wrong break-even stated with
  confidence is worse than none.

## What one kind of customer is worth

`sums` with:

```json
{"unit": "price=4.99, margin=70%, target=3000, cac=25, churn=6%, group=2.3%, adults=55484667"}
```

From the price and the share of it kept after the cost of serving
(`margin`), it prints what each customer leaves a month; with a `target`
profit (and `fixed` costs), the customers needed; with `group` (a share of
adults from `people`, or a corner's size from a scan) and `adults` (the adults
in the country: `people` prints the official figure), what share of that group
they are; with `churn` (the share who leave each month), how long a customer stays
and what they leave in all; with `cac` (the cost to win one), the months to
pay that back and lifetime value against it. Under three times is thin for a
business that must pay for its growth. Every input but the group's share is
the owner's figure or your guess: label it.

When the owner says how many customers they need ("250 regular dogs"), give
that as `customers`, not as `target` (which is money), with the group's counted
`size`; `weeks` turns a price paid every few weeks into a month's:

```json
{"unit": "customers=250, price=45, weeks=8", "options": ["Leeds: size=160000", "York: size=39000"]}
```

It prints the share of each group the owner would have to win ("1 in 640 of
the group, 0.16% of its 160,000 people"): quote that, labelled computed, as
the share the owner must judge or test, never as a forecast.

## Who to serve first, and what can be undone

See the business guide (question 3) and the build guide (step 5).

## What to hand over

The reply guide (guide topic reply). For the money, that is one line: the
break-even sentence, or the figure the choice hangs on, and what you expect
that figure to be once it is in use. Label every input given, counted or
guess. A break-even worked from guesses is a guess: say so. The expectation is
a prediction: write it down so it can be checked.
