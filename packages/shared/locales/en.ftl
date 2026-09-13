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
today = today
tomorrow = tomorrow
rate-fixed = 1 { $base } = { $rate } { $quote }
rate-asking = Asking 1 { $base } ≈ { $rate } { $quote } · negotiable
rate-open = Rate negotiable
status-active = Active
status-partial = Partially filled
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

## Channel
channel-title = { $name } gives { $amount } { $give } for { $get }
channel-methods = { $currency }: { $methods }
channel-total = ≈ { $total } { $currency }
awaiting-confirmation = { $amount } requested, awaiting confirmation

## Take / claims
take = Take
how-much = How much { $currency } do you want?
max-amount = Max { $amount }
all-of = All { $amount }
you-pay = You pay { $amount }
rate-to-agree = Rate to be agreed with { $name }
pay-with = You'll pay with
take-hint = { $name } gets a notification and confirms it's still available. Until then nothing is reserved.
request-amount = Request { $amount }
take-offer = Take this offer
back-to-offers = Back to offers
claim-waiting = Waiting for { $name } to confirm
claim-waiting-hint = Nothing is reserved yet. You'll be able to message { $name } once they confirm — no more texting people whose offer is already gone.
claim-yours = { $name } confirmed — it's yours
claim-you-marked-done = You marked done · waiting for { $name }
claim-finished = Deal completed
your-request = Your request: { $amount } · { $total } via { $method }
cancel-request = Cancel request
message-user = Message { $name }
mark-done = Mark as done
release-reservation = Release my reservation
asks-if-available = asks if available
confirm = Confirm
decline = Decline
request-from = { $amount } from { $name }
request-pending = waiting for confirmation
request-confirmed = confirmed — message { $name }
request-done = completed
request-declined = declined
request-cancelled = cancelled
no-requests = You haven't requested anything yet
error-own-offer = You can't take your own offer.
error-offer-unavailable = This offer isn't available any more.
error-already-claimed = You already have a request on this offer.
error-amount-exceeds-remaining = Only { $amount } left.
error-invalid-transition = That request was already handled.

## Bot — claim notifications
claim-request = { $name } wants to take { $amount } of your offer #{ $id } ({ $total } via { $method }). Is it still available?
claim-line-confirmed = ✓ Confirmed — reserved for { $name }
claim-line-declined = Declined — amount released
claim-line-cancelled = { $name } cancelled the request
claim-line-released = { $name } released the reservation
claim-line-waiting-you = { $name } marked it done · confirm on your side to update the post
claim-line-waiting-them = You marked it done · waiting for { $name }
claim-line-done = Deal completed
claim-dm-confirmed = { $name } confirmed — { $amount } is yours. You can message them now.
claim-dm-declined = { $name } declined your request for { $amount }.
claim-dm-released = { $name } released the reservation for { $amount }.
claim-dm-done = { $name } marked #{ $id } ({ $amount }) as done. Confirm on your side to update the post.
claim-dm-completed = Deal completed: { $amount } with { $name }.
done-too = Done on my side too
not-yet = Not yet
already-closed = Already closed
