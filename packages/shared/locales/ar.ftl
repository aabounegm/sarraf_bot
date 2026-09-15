app-name = InnoExchange
locale-tag = ar
start =
    مرحباً { $name }. ينشر InnoExchange (@{ $bot }) عروض التبديل من مجتمعنا في { $channel } ويحدّثها باستمرار.

    استخدم القائمة أدناه، أو افتح التطبيق المصغّر لعرض اللوحة كاملة.
open-app = افتح InnoExchange
back = رجوع
cancel = إلغاء
loading = جارٍ التحميل…
error-generic = حدث خطأ ما. حاول مرة أخرى.

## Board
nav-offers = العروض
nav-my-offers = عروضي
looking-for = أبحث عن
anything = أي شيء
post-offer = انشر عرضاً
no-offers = لا توجد عروض بعد
no-offers-hint = كن أول من ينشر عرضاً.
requested-hint = المبالغ المعلّمة "مطلوب" غير محجوزة بعد — على صاحب العرض التأكيد أولاً.

## Offer
details = التفاصيل
gives = { $name } يعطي
accepts = يقبل
expiry = الانتهاء
note-from = ملاحظة من { $name }
other-takers = آخرون
deals =
    { $count ->
        [zero] لا صفقات
        [one] صفقة واحدة
        [two] صفقتان
        [few] { $count } صفقات
       *[other] { $count } صفقة
    }
available = { $amount } متاح
left-of = بقي { $left } من { $total }
requested = { $amount } مطلوب
reserved = { $amount } محجوز
hours-left = بقي { $hours } س
hours-short = { $hours } س
no-expiry = بلا انتهاء
expires-at = ينتهي { $when }
today = اليوم
tomorrow = غداً
rate-fixed = 1 { $base } = { $rate } { $quote }
rate-asking = المطلوب: 1 { $base } ≈ { $rate } { $quote } · قابل للتفاوض
rate-open = السعر قابل للتفاوض
status-active = نشط
status-partial = مكتمل جزئياً
status-paused = متوقف مؤقتاً
status-closed = مغلق
status-completed = مكتمل
status-expired = منتهٍ
claim-pending = مطلوب
claim-confirmed = محجوز
claim-done = منجز
claim-declined = مرفوض
claim-cancelled = ملغى

## Create / edit
new-offer = عرض جديد
edit-offer = تعديل العرض
you-give = أنت تعطي
you-get = أنت تحصل على
network = الشبكة
payment-method = طريقة الدفع
payment-method-hint = طريقة الدفع — كيف يمكن للآخرين الدفع لك
rate-section = السعر · اختياري
asking-rate-section = السعر المطلوب · اختياري
negotiable = قابل للتفاوض
negotiable-off-hint = معطّل — السعر ثابت ويعرف الآخذون ما سيدفعون
negotiable-on-hint = يُعرض كـ"مطلوب"؛ يُتفق على السعر النهائي في المحادثة
total-fixed = = { $total } { $currency }
total-asking = ≈ { $total } { $currency } بالسعر المطلوب
expires-after = ينتهي بعد
expiry-none = بلا انتهاء
expiry-none-hint = بلا انتهاء: يسألك البوت كل 48 ساعة إن كان العرض ما زال قائماً ويوقف المنشور مؤقتاً إن لم تجب.
notes-optional = ملاحظات · اختياري
notes-placeholder = مثلاً: نقداً بعد الساعة 18:00 في تكنوبارك
post-hint = يُنشر في القناة فوراً. سيراسلك البوت عندما يطلب أحدهم أخذ جزء منه.
save-changes = حفظ التغييرات
error-amount-below-committed = لا يمكن أن يكون المبلغ أقل مما هو محجوز أو منجز بالفعل ({ $amount } { $currency }).

## My offers
posted-by-you = نشرتها أنت
your-requests = طلباتك
no-my-offers = لم تنشر شيئاً بعد
pause = إيقاف مؤقت
resume = استئناف
edit = تعديل
close = إغلاق
repost = إعادة النشر
checkin = نعم، ما زال متاحاً
close-confirm = إغلاق هذا العرض؟ ستُرفض الطلبات المعلّقة ويُحذف منشور القناة.

## Channel
channel-title = { $name } يعطي { $amount } { $give } مقابل { $get }
channel-methods = { $currency }: { $methods }
channel-total = ≈ { $total } { $currency }
awaiting-confirmation = { $amount } مطلوب، بانتظار التأكيد

## Take / claims
take = خذ
how-much = كم { $currency } تريد؟
max-amount = الحد الأقصى { $amount }
all-of = الكل { $amount }
you-pay = تدفع { $amount }
rate-to-agree = السعر يُتفق عليه مع { $name }
pay-with = ستدفع عبر
take-hint = سيصل إشعار إلى { $name } ليؤكد أن العرض ما زال متاحاً. لا شيء محجوز قبل ذلك.
request-amount = اطلب { $amount }
take-offer = خذ هذا العرض
back-to-offers = العودة إلى العروض
claim-waiting = بانتظار تأكيد { $name }
claim-waiting-hint = لا شيء محجوز بعد. ستتمكن من مراسلة { $name } بعد التأكيد — لا مزيد من مراسلة أصحاب عروض انتهت.
claim-yours = أكّد { $name } — العرض لك
claim-you-marked-done = أنهيت من جهتك · بانتظار { $name }
claim-finished = اكتملت الصفقة
your-request = طلبك: { $amount } · { $total } عبر { $method }
cancel-request = إلغاء الطلب
message-user = راسل { $name }
mark-done = تم الإنجاز
release-reservation = إلغاء حجزي
asks-if-available = يسأل إن كان متاحاً
confirm = تأكيد
decline = رفض
request-from = { $amount } من { $name }
request-pending = بانتظار التأكيد
request-confirmed = مؤكد — راسل { $name }
request-done = مكتمل
request-declined = مرفوض
request-cancelled = ملغى
no-requests = لم تطلب شيئاً بعد
error-own-offer = لا يمكنك أخذ عرضك الخاص.
error-offer-unavailable = لم يعد هذا العرض متاحاً.
error-already-claimed = لديك طلب قائم على هذا العرض.
error-amount-exceeds-remaining = المتبقي { $amount } فقط.
error-invalid-transition = تمت معالجة هذا الطلب بالفعل.
error-offer-not-found = هذا العرض غير موجود.
error-claim-not-found = هذا الطلب غير موجود.
error-not-your-offer = هذا ليس عرضك.
error-not-your-claim = هذا ليس طلبك.
error-offer-finished = هذا العرض منتهٍ بالفعل.
error-unknown-method = طريقة الدفع هذه ليست ضمن العرض.

## Bot — claim notifications
claim-request = يريد { $name } أخذ { $amount } من عرضك #{ $id } ({ $total } عبر { $method }). هل ما زال متاحاً؟
claim-line-confirmed = ✓ مؤكد — محجوز لـ { $name }
claim-line-declined = مرفوض — أُعيد المبلغ
claim-line-timeout = بلا رد — انتهت صلاحية الطلب
claim-line-cancelled = ألغى { $name } الطلب
claim-line-released = ألغى { $name } الحجز
claim-line-waiting-you = أنهى { $name } من جهته · أكّد من جهتك لتحديث المنشور
claim-line-waiting-them = أنهيت من جهتك · بانتظار { $name }
claim-line-done = اكتملت الصفقة
claim-dm-confirmed = أكّد { $name } — { $amount } لك. يمكنك مراسلته الآن.
claim-dm-declined = رفض { $name } طلبك بـ { $amount }.
claim-dm-timeout = لم يصل رد من { $name }، لذا انتهت صلاحية طلبك بـ { $amount }. لا شيء محجوز.
claim-dm-released = ألغى { $name } الحجز بـ { $amount }.
claim-dm-done = أنهى { $name } #{ $id } ({ $amount }) من جهته. أكّد من جهتك لتحديث المنشور.
claim-dm-completed = اكتملت الصفقة: { $amount } مع { $name }.
done-too = تم من جهتي أيضاً
not-yet = ليس بعد
already-closed = مغلق بالفعل

## Bot — scheduler
offer-dm-expired = انتهت صلاحية #{ $id }، وحُذف منشوره من القناة. أعيد نشره 24 ساعة أخرى؟
offer-dm-checkin = هل ما زال #{ $id } متاحاً؟ إن لم يصلني رد خلال 24 ساعة سأوقفه مؤقتاً، حتى لا يراسلك أحد بشأن عرض انتهى.
offer-dm-autopaused = لم يصل رد، لذا #{ $id } موقوف مؤقتاً والمنشور يوضّح ذلك. استأنفه متى شئت.

## Bot — menu and commands
menu-browse = تصفّح العروض
menu-help = مساعدة
board-position = العرض { $n } من أصل { $total }
# Flipped on purpose: in an RTL layout the previous offer is to the right.
board-prev = ▶
board-next = ◀
command-new = انشر عرضاً، سؤالاً واحداً في كل مرة
command-mine = عروضك وطلباتك مع أزرار إدارتها
command-board = تصفّح العروض المتاحة الآن
command-help = قائمة الأوامر هذه
command-cancel = أوقف ما نحن بصدده
help =
    ما يمكنني فعله:

    { $commands }

    أنا لا أحتفظ بالأموال أبداً. أبقي كل عرض في { $channel } محدّثاً، وأعرّف الطرفين ببعضهما حين يتفقان.
mine-claim = { $name } · { $amount } عبر { $method } · { $status }
mine-offer-gone = لم يعد هذا العرض في قائمتك.

## Bot — new offer wizard
wizard-new = عرض جديد.
wizard-editing = تعديل #{ $id }.
wizard-give-currency = ماذا تعطي؟
wizard-give-amount = كم { $currency }؟
wizard-give-methods = كيف سترسل { $currency }؟ اختر كل ما ينطبق.
wizard-get-currency = وماذا تريد أن تحصل عليه؟
wizard-get-methods = كيف يمكنهم الدفع لك بـ { $currency }؟ اختر كل ما ينطبق.
wizard-pick-one = اختر واحداً على الأقل
wizard-done-count = تم ({ $count })
wizard-rate = ما سعرك؟ أرسل رقماً — 1 { $base } = … { $quote }.
wizard-no-rate = قابل للتفاوض، بلا سعر
wizard-rate-kind = 1 { $base } = { $rate } { $quote }. هل هو ثابت أم هذا ما تطلبه؟
wizard-fixed = ثابت
wizard-asking = مطلوب · قابل للتفاوض
wizard-expiry = كم يبقى العرض منشوراً؟
wizard-expiry-now = حالياً: { $when }.
wizard-note = تضيف ملاحظة؟ حتى { $max } حرفاً.
wizard-skip = تخطٍّ
wizard-keep = أبقِ { $value }
wizard-preview = هذا عرضك:
wizard-post = انشر في القناة
wizard-restart = ابدأ من جديد
wizard-posted = نُشر. #{ $id } الآن في { $channel } — سأراسلك حالما يطلب أحدهم جزءاً منه.
wizard-saved = حُفظ. #{ $id } محدّث، ومنشور القناة كذلك.
wizard-cancelled = أُلغي.
wizard-bad-amount = أرسل المبلغ رقماً، مثل 200.
wizard-bad-rate = أرسل السعر رقماً، مثل 96.5.
wizard-too-long = هذا { $count } حرفاً والحد { $max }. جرّب نصاً أقصر.
wizard-use-buttons = استخدم الأزرار أعلاه، أو /cancel.

## Bot — take wizard
take-amount-hint = { $max }. أرسل رقماً، أو:
take-preview = تطلب { $amount } من #{ $id }، { $total }، عبر { $method }.
