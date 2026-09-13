app-name = InnoExchange
locale-tag = en
start =
    Hi { $name }. InnoExchange (@{ $bot }) posts swap offers from our community to { $channel } and keeps them up to date.

    Use the menu below, or open the mini app for the full board.
open-app = Open InnoExchange
back = Back
cancel = Cancel
loading = Loading…
error-generic = Something went wrong. Please try again.

## Board
nav-offers = Offers
nav-my-offers = My offers
looking-for = I'm looking for
anything = Anything
post-offer = Post an offer
no-offers = No offers yet
no-offers-hint = Be the first to post one.
requested-hint = Amounts marked "requested" aren't reserved yet — the poster still has to confirm.

## Offer
details = Details
gives = { $name } gives
accepts = Accepts
partial-amounts = Partial amounts
allowed = Allowed
expiry = Expiry
note-from = Note from { $name }
other-takers = Other takers
deals =
    { $count ->
        [one] { $count } deal
       *[other] { $count } deals
    }
available = { $amount } available
left-of = { $left } of { $total } left
requested = { $amount } requested
reserved = { $amount } reserved
hours-left = { $hours }h left
hours-short = { $hours }h
no-expiry = no expiry
expires-at = expires { $when }
rate-fixed = 1 { $base } = { $rate } { $quote }
rate-asking = Asking 1 { $base } ≈ { $rate } { $quote } · negotiable
rate-open = Rate negotiable
status-paused = Paused
status-closed = Closed
status-completed = Completed
status-expired = Expired
claim-pending = requested
claim-confirmed = reserved
claim-done = done
claim-declined = declined
claim-cancelled = cancelled

## Create / edit
new-offer = New offer
edit-offer = Edit offer
you-give = You give
you-get = You get
network = Network
payment-method = Payment method
payment-method-hint = Payment method — people can pay you via
rate-section = Rate · optional
asking-rate-section = Asking rate · optional
negotiable = Negotiable
negotiable-off-hint = Off — rate is fixed, takers know what they pay
negotiable-on-hint = Shown as "asking"; final rate agreed in chat
total-fixed = = { $total } { $currency }
total-asking = ≈ { $total } { $currency } at asking rate
expires-after = Expires after
expiry-none = None
expiry-none-hint = No expiry: the bot asks you every 48h if it's still on and pauses the post if you don't answer.
notes-optional = Notes · optional
notes-placeholder = e.g. Cash after 18:00 at Technopark
post-hint = Posts to the channel immediately. You'll get a bot message whenever someone asks to take part of it.
save-changes = Save changes
error-amount-below-committed = The amount can't be lower than what is already reserved or done ({ $amount } { $currency }).

## My offers
posted-by-you = Posted by you
your-requests = Your requests
no-my-offers = You haven't posted anything yet
pause = Pause
resume = Resume
edit = Edit
close = Close
close-confirm = Close this offer? Pending requests will be declined and the channel post removed.
