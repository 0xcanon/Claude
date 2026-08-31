# v24 — the owner app grows up

Before this, the owner app could do one thing: approve new customers. Every
other decision — what to bake, whether to hold an order, answering a shop that
got a short delivery, taking a bread off sale — meant finding a computer.

It now has five tabs, and the bakery can be run from a phone.

## Today

The morning screen. Cases to bake, boxes to pack, what is labeled and waiting
on UPS, and what is owed with how much of it is past due. Under that, the
**bake sheet** — how many cases of each bread the day needs, biggest first.
That is the number the person at the oven actually reads.

Held orders get called out by name, because an order that silently stops is
worse than a late one.

## Orders

The shipping queue. Filter by needs-shipping, today, or all. Select the orders
going out and buy their UPS labels, or mark them shipped — which emails and
push-notifies every buyer their tracking number.

Only orders that are actually going out can be selected. You cannot buy a
label for a cancelled order by tapping select-all, which is the mistake this
screen exists to prevent.

## One order, in full

Tap an order and you get what is in it, where it is going, the money, and
every action from v23: **put on hold**, **take off hold**, **send money back**
(part or all), **cancel**, **mark delivered**, and **mark invoice paid**.

Underneath is the order's **full history** — every change, who made it, never
edited. An order held from the bench and one held from the office are
indistinguishable afterwards: same state machine, same refusals, same line in
the record with your email on it.

## Problems

The support queue, sorted by what each problem is costing the buyer right now
rather than when it arrived. Reply and the buyer is emailed immediately; your
own note beside it never reaches them. A case cannot be closed without writing
something first — somebody is waiting.

## Bread

Stock control for when you are at the oven. Flip a bread off and it disappears
from the catalog straight away, so nobody orders what you cannot bake. Set a
daily cap in cases, or leave it at zero for no limit.

Deliberately narrow: ingredients, allergens and box dimensions stay in the web
portal, where there is room to read what you are changing. Getting an allergen
wrong on a phone is not a risk worth the convenience.

---

## Under the hood

Five new endpoints under `/api/mobile/admin/`, all behind one guard:

| Route | What it serves |
| --- | --- |
| `summary` | The day's numbers, the bake sheet, and what is waiting |
| `orders` | The queue, plus labels, mark-shipped and invoice-paid |
| `order-actions` | Hold, release, correct, cancel, refund, deliver — and the history |
| `support` | The problem queue and replies |
| `products` | Stock on/off and daily capacity |

They call the same service layer the web portal calls, so the two cannot drift
apart on what an order is allowed to do.

**Access is unchanged and still narrow.** The session token is signed and
carries an email, and it is refused unless that email is the one configured
for the deployment — a token minted for anybody else is not a weaker session,
it is not a session at all. The account is then loaded on every request, which
is what makes a forced password change block work rather than merely suggest
it. That guard lives in one file so it cannot be written correctly four times
and wrongly once.

`app/bake-sheet.ts` is new and pure: the bake sheet used to be computed inside
the admin page's React component, so the phone could not have shown the same
numbers without repeating the arithmetic. Two copies of "how many cases do we
owe today" is exactly the kind of thing that drifts.

**A bug caught while building it:** the day's "owed" figure was read from the
open shipping queue, so a delivered order with an unpaid invoice vanished from
the total. Money owed is now read from every order, because an invoice outlives
the queue. There is a test for it.

**Verified:** 192 tests passing (9 new), lint and strict TypeScript clean
across all three projects, and every endpoint exercised against a running
server — including holding an order from the phone and watching the line
appear in the same audit trail the web portal writes.
