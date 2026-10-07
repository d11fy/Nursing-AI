-- Public manual-payment destinations. These are shown only inside the
-- authenticated subscription/payment flow, never on the marketing page.

with desired(name,type,account_holder,account_number,iban,wallet_number,instructions,sort_order) as (
  values
    ('بنك فلسطين','bank','علي سهيل محمد الكحلوت','0567508786',null,null,'حوّل المبلغ إلى الحساب، ثم ارفع إشعار الدفع للمراجعة.',10),
    ('جوال باي','wallet','علي سهيل محمد الكحلوت',null,null,'0567508786','حوّل المبلغ إلى المحفظة، ثم ارفع إشعار الدفع للمراجعة.',20),
    ('بال باي','wallet','علي سهيل محمد الكحلوت',null,null,'0567508786','حوّل المبلغ إلى المحفظة، ثم ارفع إشعار الدفع للمراجعة.',30)
)
update payment_methods method
set type=desired.type,
    account_holder=desired.account_holder,
    account_number=desired.account_number,
    iban=desired.iban,
    wallet_number=desired.wallet_number,
    instructions=desired.instructions,
    sort_order=desired.sort_order,
    active=true,
    updated_at=now()
from desired
where lower(trim(method.name))=lower(trim(desired.name));

with desired(name,type,account_holder,account_number,iban,wallet_number,instructions,sort_order) as (
  values
    ('بنك فلسطين','bank','علي سهيل محمد الكحلوت','0567508786',null,null,'حوّل المبلغ إلى الحساب، ثم ارفع إشعار الدفع للمراجعة.',10),
    ('جوال باي','wallet','علي سهيل محمد الكحلوت',null,null,'0567508786','حوّل المبلغ إلى المحفظة، ثم ارفع إشعار الدفع للمراجعة.',20),
    ('بال باي','wallet','علي سهيل محمد الكحلوت',null,null,'0567508786','حوّل المبلغ إلى المحفظة، ثم ارفع إشعار الدفع للمراجعة.',30)
)
insert into payment_methods(name,type,account_holder,account_number,iban,wallet_number,instructions,sort_order,active)
select desired.name,desired.type,desired.account_holder,desired.account_number,desired.iban,desired.wallet_number,desired.instructions,desired.sort_order,true
from desired
where not exists (
  select 1 from payment_methods method where lower(trim(method.name))=lower(trim(desired.name))
);
