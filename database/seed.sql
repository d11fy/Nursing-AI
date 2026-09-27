-- Default subjects. Safe to run multiple times.
insert into public.subjects (name_ar, name_en, description) values
  ('أساسيات التمريض', 'Fundamentals of Nursing', 'المفاهيم والمهارات الأساسية في التمريض'),
  ('التشريح ووظائف الأعضاء', 'Anatomy & Physiology', 'بنية ووظائف أجهزة جسم الإنسان'),
  ('علم الأدوية', 'Pharmacology', 'الأدوية، آلية عملها، والجرعات التمريضية'),
  ('تمريض الباطني والجراحي', 'Medical-Surgical Nursing', 'رعاية المرضى البالغين في الحالات الباطنية والجراحية'),
  ('تمريض الأمومة', 'Maternity Nursing', 'رعاية الأم والجنين قبل وأثناء وبعد الولادة'),
  ('تمريض الأطفال', 'Pediatric Nursing', 'رعاية الرضع والأطفال'),
  ('الصحة النفسية', 'Mental Health Nursing', 'رعاية المرضى ذوي الاضطرابات النفسية'),
  ('صحة المجتمع', 'Community Health Nursing', 'الرعاية الصحية على مستوى المجتمع والوقاية')
on conflict (name_en) do nothing;
