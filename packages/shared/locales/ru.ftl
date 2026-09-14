app-name = InnoExchange
locale-tag = ru
start =
    Привет, { $name }. InnoExchange (@{ $bot }) публикует предложения обмена от нашего сообщества в { $channel } и поддерживает их в актуальном состоянии.

    Используйте меню ниже или откройте мини-приложение, чтобы увидеть всю доску.
open-app = Открыть InnoExchange
back = Назад
cancel = Отмена
loading = Загрузка…
error-generic = Что-то пошло не так. Попробуйте ещё раз.

## Board
nav-offers = Предложения
nav-my-offers = Мои предложения
looking-for = Мне нужно
anything = Что угодно
post-offer = Разместить предложение
no-offers = Предложений пока нет
no-offers-hint = Станьте первым, кто разместит предложение.
requested-hint = Суммы с пометкой «запрошено» ещё не зарезервированы — автор должен подтвердить.

## Offer
details = Детали
gives = { $name } отдаёт
accepts = Принимает
expiry = Срок действия
note-from = Заметка от { $name }
other-takers = Другие участники
deals =
    { $count ->
        [one] { $count } сделка
        [few] { $count } сделки
       *[many] { $count } сделок
    }
available = Доступно { $amount }
left-of = Осталось { $left } из { $total }
requested = запрошено { $amount }
reserved = зарезервировано { $amount }
hours-left = осталось { $hours } ч
hours-short = { $hours } ч
no-expiry = бессрочно
expires-at = истекает { $when }
today = сегодня
tomorrow = завтра
rate-fixed = 1 { $base } = { $rate } { $quote }
rate-asking = Запрос: 1 { $base } ≈ { $rate } { $quote } · договорной
rate-open = Курс договорной
status-active = Активно
status-partial = Частично заполнено
status-paused = На паузе
status-closed = Закрыто
status-completed = Завершено
status-expired = Истекло
claim-pending = запрошено
claim-confirmed = зарезервировано
claim-done = выполнено
claim-declined = отклонено
claim-cancelled = отменено

## Create / edit
new-offer = Новое предложение
edit-offer = Изменить предложение
you-give = Вы отдаёте
you-get = Вы получаете
network = Сеть
payment-method = Способ оплаты
payment-method-hint = Способ оплаты — как вам могут заплатить
rate-section = Курс · необязательно
asking-rate-section = Желаемый курс · необязательно
negotiable = Договорной
negotiable-off-hint = Выкл. — курс фиксированный, участники знают, сколько платят
negotiable-on-hint = Показывается как «запрос»; итоговый курс согласуется в чате
total-fixed = = { $total } { $currency }
total-asking = ≈ { $total } { $currency } по желаемому курсу
expires-after = Истекает через
expiry-none = Без срока
expiry-none-hint = Без срока: бот каждые 48 ч спрашивает, актуально ли предложение, и ставит пост на паузу, если вы не отвечаете.
notes-optional = Заметки · необязательно
notes-placeholder = напр. Наличные после 18:00 в Технопарке
post-hint = Публикуется в канале сразу. Бот напишет вам, когда кто-то захочет взять часть.
save-changes = Сохранить изменения
error-amount-below-committed = Сумма не может быть меньше уже зарезервированного или выполненного ({ $amount } { $currency }).

## My offers
posted-by-you = Размещено вами
your-requests = Ваши запросы
no-my-offers = Вы пока ничего не размещали
pause = Пауза
resume = Возобновить
edit = Изменить
close = Закрыть
close-confirm = Закрыть предложение? Ожидающие запросы будут отклонены, а пост в канале удалён.

## Channel
channel-title = { $name } отдаёт { $amount } { $give } за { $get }
channel-methods = { $currency }: { $methods }
channel-total = ≈ { $total } { $currency }
awaiting-confirmation = запрошено { $amount }, ожидает подтверждения

## Take / claims
take = Взять
how-much = Сколько { $currency } вам нужно?
max-amount = Максимум { $amount }
all-of = Все { $amount }
you-pay = Вы платите { $amount }
rate-to-agree = Курс обсуждается с { $name }
pay-with = Вы заплатите через
take-hint = { $name } получит уведомление и подтвердит, что предложение в силе. До этого ничего не резервируется.
request-amount = Запросить { $amount }
take-offer = Взять это предложение
back-to-offers = К предложениям
claim-waiting = Ждём подтверждения от { $name }
claim-waiting-hint = Пока ничего не зарезервировано. Написать { $name } можно будет после подтверждения — больше никаких сообщений тем, чьё предложение уже неактуально.
claim-yours = { $name } подтвердил(а) — это ваше
claim-you-marked-done = Вы отметили как выполненное · ждём { $name }
claim-finished = Сделка завершена
your-request = Ваш запрос: { $amount } · { $total } через { $method }
cancel-request = Отменить запрос
message-user = Написать { $name }
mark-done = Отметить выполненным
release-reservation = Снять мою бронь
asks-if-available = спрашивает, актуально ли
confirm = Подтвердить
decline = Отклонить
request-from = { $amount } от { $name }
request-pending = ждёт подтверждения
request-confirmed = подтверждено — напишите { $name }
request-done = завершено
request-declined = отклонено
request-cancelled = отменено
no-requests = Вы ещё ничего не запрашивали
error-own-offer = Нельзя взять собственное предложение.
error-offer-unavailable = Это предложение больше недоступно.
error-already-claimed = У вас уже есть запрос на это предложение.
error-amount-exceeds-remaining = Осталось только { $amount }.
error-invalid-transition = Этот запрос уже обработан.
error-offer-not-found = Такого предложения нет.
error-claim-not-found = Такого запроса нет.
error-not-your-offer = Это не ваше предложение.
error-not-your-claim = Это не ваш запрос.
error-offer-finished = Это предложение уже завершено.
error-unknown-method = Такого способа оплаты нет в предложении.

## Bot — claim notifications
claim-request = { $name } хочет взять { $amount } из вашего предложения #{ $id } ({ $total } через { $method }). Оно ещё актуально?
claim-line-confirmed = ✓ Подтверждено — зарезервировано за { $name }
claim-line-declined = Отклонено — сумма освобождена
claim-line-cancelled = { $name } отменил(а) запрос
claim-line-released = { $name } снял(а) бронь
claim-line-waiting-you = { $name } отметил(а) выполненным · подтвердите со своей стороны, чтобы обновить пост
claim-line-waiting-them = Вы отметили выполненным · ждём { $name }
claim-line-done = Сделка завершена
claim-dm-confirmed = { $name } подтвердил(а) — { $amount } ваши. Теперь можно написать напрямую.
claim-dm-declined = { $name } отклонил(а) ваш запрос на { $amount }.
claim-dm-released = { $name } снял(а) бронь на { $amount }.
claim-dm-done = { $name } отметил(а) #{ $id } ({ $amount }) как выполненное. Подтвердите со своей стороны, чтобы обновить пост.
claim-dm-completed = Сделка завершена: { $amount } с { $name }.
done-too = Выполнено и с моей стороны
not-yet = Ещё нет
already-closed = Уже закрыто

## Bot — menu and commands
menu-browse = Смотреть предложения
menu-help = Помощь
board-hint = Вся доска с фильтрами и вашей историей — в мини-приложении.
help =
    Что я умею:

    /new — разместить предложение, по одному вопросу за раз
    /mine — ваши предложения и запросы вместе с кнопками управления
    /board — открыть мини-приложение
    /cancel — прервать текущий шаг

    Я никогда не держу деньги. Я поддерживаю каждое предложение в { $channel } в актуальном состоянии и знакомлю стороны, когда обе согласны.
mine-claim = { $name } · { $amount } через { $method } · { $status }
mine-offer-gone = Этого предложения больше нет в вашем списке.

## Bot — new offer wizard
wizard-new = Новое предложение.
wizard-editing = Редактируем #{ $id }.
wizard-give-currency = Что вы отдаёте?
wizard-give-amount = Сколько { $currency }?
wizard-give-methods = Как вы отправите { $currency }? Выберите все подходящие.
wizard-get-currency = А что хотите получить?
wizard-get-methods = Как вам смогут заплатить в { $currency }? Выберите все подходящие.
wizard-pick-one = Выберите хотя бы одно
wizard-done-count = Готово ({ $count })
wizard-rate = Какой у вас курс? Отправьте число — 1 { $base } = … { $quote }.
wizard-no-rate = Договорной, без курса
wizard-rate-kind = 1 { $base } = { $rate } { $quote }. Это фиксированный курс или желаемый?
wizard-fixed = Фиксированный
wizard-asking = Желаемый · договорной
wizard-expiry = Сколько предложение должно висеть?
wizard-expiry-now = Сейчас: { $when }.
wizard-note = Добавить заметку? До { $max } символов.
wizard-skip = Пропустить
wizard-keep = Оставить { $value }
wizard-preview = Вот ваше предложение:
wizard-post = Опубликовать в канале
wizard-restart = Начать заново
wizard-posted = Опубликовано. #{ $id } в { $channel } — напишу вам, как только кто-то захочет взять часть.
wizard-saved = Сохранено. #{ $id } обновлено, пост в канале тоже.
wizard-cancelled = Отменено.
wizard-bad-amount = Отправьте сумму числом, например 200.
wizard-bad-rate = Отправьте курс числом, например 96.5.
wizard-too-long = Здесь { $count } символов, а предел — { $max }. Попробуйте короче.
wizard-use-buttons = Используйте кнопки выше или /cancel.

## Bot — take wizard
take-amount-hint = { $max }. Отправьте число или:
take-preview = Вы запрашиваете { $amount } из #{ $id }, { $total }, через { $method }.
