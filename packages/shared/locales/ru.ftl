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
