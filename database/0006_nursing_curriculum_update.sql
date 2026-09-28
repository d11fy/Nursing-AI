-- Update nursing curriculum based on Islamic University of Gaza (IUG) syllabus
-- Add course_code, course_type, and semester columns to subjects

alter table public.subjects
  add column if not exists course_code text,
  add column if not exists course_type text,
  add column if not exists semester integer check (semester in (1, 2));

-- Clean up existing placeholder subjects and their associations as requested
delete from public.subject_academic_years;
delete from public.lectures where subject_id is not null;
delete from public.documents where subject_id is not null;
update public.conversations set subject_id = null;
delete from public.subjects;

-- Insert all 56 curriculum courses
insert into public.subjects (
  name_ar, name_en, course_code, course_type, semester, sort_order, description_ar, icon
) values
  -- المستوى الأول - الفصل الأول (First Year - Semester 1)
  ('دراسات في السيرة', 'Studies in the Prophet''s Biography (HADT 1202)', 'HADT 1202', 'جامعة', 1, 1, 'سيرة النبي صلى الله عليه وسلم والدروس المستفادة', 'book-open'),
  ('مصطلحات طبية', 'Medical Terminology (NURS 1202)', 'NURS 1202', 'كلية', 1, 2, 'المصطلحات الطبية والتمريضية الأساسية وطرق تركيبها', 'stethoscope'),
  ('الأحياء الدقيقة', 'Microbiology (NURS 1303)', 'NURS 1303', 'كلية', 1, 3, 'علم الأحياء الدقيقة والبكتيريا والفيروسات ومكافحة العدوى', 'microscope'),
  ('كيمياء حيوية', 'Biochemistry (NURS 1310)', 'NURS 1310', 'كلية', 1, 4, 'المركبات الكيميائية الحيوية والتفاعلات الحيوية في جسم الإنسان', 'flask-conical'),
  ('علم النفس', 'Psychology (NURS 1325)', 'NURS 1325', 'كلية', 1, 5, 'مبادئ علم النفس والسلوك الإنساني والتعامل مع المرضى', 'brain'),
  ('قرآن كريم (1)', 'Holy Quran 1 (QURN 1101)', 'QURN 1101', 'جامعة', 1, 6, 'تلاوة وحفظ وتفسير الأجزاء المقررة من القرآن الكريم', 'book-open'),
  ('دراسات في الفقه', 'Studies in Islamic Jurisprudence (SHAR 1202)', 'SHAR 1202', 'جامعة', 1, 7, 'أحكام الفقه الإسلامي ومسائل الطهارة والعبادات والمعاملات', 'scale'),

  -- المستوى الأول - الفصل الثاني (First Year - Semester 2)
  ('اللغة العربية (نحو وصرف)', 'Arabic Language: Grammar and Morphology (ARAB 1202)', 'ARAB 1202', 'جامعة', 2, 8, 'قواعد النحو والصرف وتنمية مهارات التعبير واللغة العربية', 'book-marked'),
  ('اللغة الإنجليزية', 'English Language (ENGL 1201)', 'ENGL 1201', 'جامعة', 2, 9, 'تنمية مهارات اللغة الإنجليزية العامة والطبية', 'languages'),
  ('أسس علم التمريض (1) عملي', 'Fundamentals of Nursing 1 Practical (NURS 1136)', 'NURS 1136', 'تخصص', 2, 10, 'التطبيقات السريرية والعملية للمهارات التمريضية الأساسية', 'activity'),
  ('التغذية الإكلينيكية', 'Clinical Nutrition (NURS 1204)', 'NURS 1204', 'كلية', 2, 11, 'أسس التغذية العلاجية والاحتياجات الغذائية للمرضى والأصحاء', 'apple'),
  ('علم التشريح ووظائف الأعضاء (1)', 'Anatomy and Physiology 1 (NURS 1305)', 'NURS 1305', 'كلية', 2, 12, 'بنية وتشريح ووظائف أجهزة جسم الإنسان - الجزء الأول', 'heart-pulse'),
  ('أسس علم التمريض (1)', 'Fundamentals of Nursing 1 (NURS 1315)', 'NURS 1315', 'تخصص', 2, 13, 'المفاهيم والنظريات الأساسية لممارسة مهنة التمريض', 'clipboard-plus'),
  ('قرآن كريم (2)', 'Holy Quran 2 (QURN 2101)', 'QURN 2101', 'جامعة', 2, 14, 'تلاوة وحفظ وتجويد الأجزاء المقررة من القرآن الكريم', 'book-open'),
  ('دراسات في القرآن وعلومه', 'Studies in Quran and its Sciences (QURN 2201)', 'QURN 2201', 'جامعة', 2, 15, 'علوم القرآن الكريم وأسباب النزول والإعجاز', 'book-open'),

  -- المستوى الثاني - الفصل الأول (Second Year - Semester 1)
  ('أخلاقيات وقضايا مهنية', 'Ethics and Professional Issues (NURS 2201)', 'NURS 2201', 'تخصص', 1, 16, 'أخلاقيات الممارسة التمريضية والمسؤوليات القانونية والمهنية', 'shield-check'),
  ('علم الأدوية (1)', 'Pharmacology 1 (NURS 2207)', 'NURS 2207', 'تخصص', 1, 17, 'مبادئ علم الأدوية ومجموعات الأدوية وتأثيراتها والجرعات التمريضية', 'pill'),
  ('التقييم الصحي التمريضي', 'Health Assessment in Nursing (NURS 2214)', 'NURS 2214', 'تخصص', 1, 18, 'الفحص البدني والتقييم السريري الشامل لجميع أجهزة الجسم', 'stethoscope'),
  ('علم التشريح ووظائف الأعضاء (2)', 'Anatomy and Physiology 2 (NURS 2305)', 'NURS 2305', 'كلية', 1, 19, 'بنية وتشريح ووظائف أجهزة جسم الإنسان - الجزء الثاني', 'heart-pulse'),
  ('أسس علم التمريض (2) (عملي)', 'Fundamentals of Nursing 2 Practical (NURS 2308)', 'NURS 2308', 'تخصص', 1, 20, 'التطبيقات العملية المتقدمة للمهارات التمريضية السريرية', 'activity'),
  ('أسس علم التمريض (2)', 'Fundamentals of Nursing 2 (NURS 2315)', 'NURS 2315', 'تخصص', 1, 21, 'المفاهيم التمريضية المتقدمة والعملية التمريضية وتوثيق الرعاية', 'clipboard-plus'),
  ('قرآن كريم (3)', 'Holy Quran 3 (QURN 3101)', 'QURN 3101', 'جامعة', 1, 22, 'تلاوة وتجويد وحفظ الأجزاء المقررة من القرآن الكريم', 'book-open'),

  -- المستوى الثاني - الفصل الثاني (Second Year - Semester 2)
  ('دراسات في العقيدة', 'Studies in Islamic Creed (AQID 3306)', 'AQID 3306', 'جامعة', 2, 23, 'أركان الإيمان والعقيدة الإسلامية الصافية ودفع الشبهات', 'book-open'),
  ('علم أدوية (2)', 'Pharmacology 2 (NURS 2210)', 'NURS 2210', 'تخصص', 2, 24, 'علم الأدوية المتقدم وتطبيقاته على الأمراض المختلفة والرعاية التمريضية', 'pill'),
  ('علم النمو والتطور', 'Growth and Development (NURS 2216)', 'NURS 2216', 'كلية', 2, 25, 'مراحل نمو وتطور الإنسان الجسدي والنفسي عبر مراحل العمر', 'baby'),
  ('تمريض صحة البالغين (1) عملي', 'Adult Health Nursing 1 Practical (NURS 2320)', 'NURS 2320', 'تخصص', 2, 26, 'التدريب السريري لرعاية المرضى البالغين في الأقسام الباطنية والجراحية (1)', 'hospital'),
  ('تمريض صحة البالغين (1)', 'Adult Health Nursing 1 (NURS 2321)', 'NURS 2321', 'تخصص', 2, 27, 'الرعاية التمريضية للأمراض الباطنية والجراحية الشائعة لدى البالغين', 'user-round'),
  ('متطلب جامعة اختياري', 'University Elective (OPTI 3206)', 'OPTI 3206', 'جامعة', 2, 28, 'مساق اختياري عام من متطلبات الجامعة لتوسيع المعرفة', 'sparkles'),
  ('النظم الإسلامية', 'Islamic Systems (SHAR 2207)', 'SHAR 2207', 'جامعة', 2, 29, 'النظم السياسية والاجتماعية والاقتصادية في الإسلام', 'scale'),
  ('عمل تطوعي / 60 ساعة', 'Voluntary Work 60 Hours (VOLN 1000)', 'VOLN 1000', 'جامعة', 2, 30, 'ساعات العمل التطوعي الميداني والمشاركة المجتمعية', 'heart-handshake'),

  -- المستوى الثالث - الفصل الأول (Third Year - Semester 1)
  ('تدريب ميداني متقدم', 'Advanced Field Training (NURS 3201)', 'NURS 3201', 'تخصص', 1, 31, 'تدريب عملي وميداني مكثف لتطبيق المهارات التمريضية المتقدمة', 'building-2'),
  ('استراتيجيات التعليم والتثقيف الصحي', 'Health Education and Teaching Strategies (NURS 3313)', 'NURS 3313', 'تخصص', 1, 32, 'طرق وأساليب التثقيف الصحي وإعداد برامج التوعية الصحية للمرضى والمجتمع', 'graduation-cap'),
  ('تمريض صحة البالغين (2)', 'Adult Health Nursing 2 (NURS 3315)', 'NURS 3315', 'تخصص', 1, 33, 'الرعاية التمريضية للحالات الباطنية والجراحية التخصصية والحرجة', 'activity'),
  ('تمريض صحة البالغين (2) عملي', 'Adult Health Nursing 2 Practical (NURS 3316)', 'NURS 3316', 'تخصص', 1, 34, 'التدريب السريري المتخصص في أقسام الجراحة والباطنة والعناية المتوسطة', 'hospital'),
  ('متطلب اختياري (1)', 'Department Elective 1 (OPTI 3301)', 'OPTI 3301', 'تخصص', 1, 35, 'مساق اختياري تخصصي من متطلبات قسم التمريض', 'book-open'),
  ('دراسات فلسطينية', 'Palestinian Studies (POLS 3220)', 'POLS 3220', 'جامعة', 1, 36, 'تاريخ وجغرافية وقضية فلسطين والهوية الوطنية', 'map-pin'),

  -- المستوى الثالث - الفصل الثاني (Third Year - Semester 2)
  ('حاضر العالم الإسلامي', 'Contemporary Muslim World (AQID 3201)', 'AQID 3201', 'جامعة', 2, 37, 'قضايا وتحديات العالم الإسلامي المعاصر والتطورات الحديثة', 'globe'),
  ('الإحصاء الحيوي', 'Biostatistics (NURS 3212)', 'NURS 3212', 'كلية', 2, 38, 'تطبيقات علم الإحصاء وطرق جمع وتحليل البيانات في البحوث الصحية', 'chart-bar'),
  ('تمريض صحة البالغين (3)', 'Adult Health Nursing 3 (NURS 3320)', 'NURS 3320', 'تخصص', 2, 39, 'الرعاية التمريضية المتقدمة للحالات المعقدة وحالات الطوارئ والعناية المركزة', 'heart-pulse'),
  ('تمريض صحة البالغين (3) (عملي)', 'Adult Health Nursing 3 Practical (NURS 3321)', 'NURS 3321', 'تخصص', 2, 40, 'التدريب السريري في أقسام العناية المركزة والطوارئ والرعاية الحرجة', 'activity'),
  ('تمريض صحة الأطفال واليافعين', 'Child and Adolescent Health Nursing (NURS 3325)', 'NURS 3325', 'تخصص', 2, 41, 'الرعاية التمريضية الشاملة للأطفال وحديثي الولادة واليافعين في الصحة والمرض', 'baby'),
  ('تمريض صحة الأطفال واليافعين (عملي)', 'Child and Adolescent Health Nursing Practical (NURS 3326)', 'NURS 3326', 'تخصص', 2, 42, 'التدريب السريري في أقسام الأطفال والحضانات ورعاية الأطفال المرضى', 'stethoscope'),
  ('قرآن كريم (4)', 'Holy Quran 4 (QURN 4102)', 'QURN 4102', 'جامعة', 2, 43, 'تلاوة وحفظ وتجويد الأجزاء المقررة من القرآن الكريم لإنهاء المتطلب', 'book-open'),

  -- المستوى الرابع - الفصل الأول (Fourth Year - Semester 1)
  ('دراسات في الحديث الشريف', 'Studies in Prophetic Hadith (HADT 4204)', 'HADT 4204', 'جامعة', 1, 44, 'دراسة نصوص ومصطلح الحديث النبوي الشريف وتطبيقاته التربوية', 'book-open'),
  ('مناهج البحث العلمي', 'Scientific Research Methodology (NURS 4303)', 'NURS 4303', 'كلية', 1, 45, 'أسس وخطوات البحث العلمي وتصميم الدراسات التمريضية والصحية', 'search'),
  ('صحة المجتمع (عملي)', 'Community Health Practical (NURS 4304)', 'NURS 4304', 'تخصص', 1, 46, 'التدريب الميداني في مراكز الرعاية الأولية والعيادات المجتمعية والمدارس', 'users'),
  ('صحة المجتمع', 'Community Health (NURS 4306)', 'NURS 4306', 'تخصص', 1, 47, 'مفاهيم صحة المجتمع والصحة العامة وعلم الأوبئة والرعاية الوقائية', 'shield-plus'),
  ('تمريض صحة الأمومة', 'Maternity Health Nursing (NURS 4326)', 'NURS 4326', 'تخصص', 1, 48, 'رعاية المرأة خلال مراحل الحمل والولادة والنفاس وصحة حديثي الولادة', 'heart'),
  ('تمريض صحة الأمومة (عملي)', 'Maternity Health Nursing Practical (NURS 4327)', 'NURS 4327', 'تخصص', 1, 49, 'التدريب السريري في أقسام الولادة والنساء ومتابعة الحوامل', 'activity'),

  -- المستوى الرابع - الفصل الثاني (Fourth Year - Semester 2)
  ('فترة تأهيل عملي (300 ساعة عملية)', 'Clinical Internship 300 Hours (NURS 4001)', 'NURS 4001', 'تخصص', 2, 50, 'فترة الامتياز والتدريب الميداني المكثف لإتقان المهارات المهنية والسريرية', 'briefcase'),
  ('بحث تطبيقي', 'Applied Research (NURS 4103)', 'NURS 4103', 'تخصص', 2, 51, 'إعداد وتنفيذ مشروع بحثي تطبيقي في مجال التمريض والرعاية الصحية', 'file-text'),
  ('تمريض الصحة النفسية', 'Mental Health Nursing (NURS 4328)', 'NURS 4328', 'تخصص', 2, 52, 'مفاهيم الصحة النفسية والاضطرابات النفسية والسلوكية والرعاية التمريضية للمرضى النفسيين', 'smile'),
  ('تمريض الصحة النفسية (عملي)', 'Mental Health Nursing Practical (NURS 4329)', 'NURS 4329', 'تخصص', 2, 53, 'التدريب السريري في مستشفيات ومراكز الطب النفسي والتأهيل السلوكي', 'activity'),
  ('الإدارة والقيادة في التمريض', 'Nursing Management and Leadership (NURS 4333)', 'NURS 4333', 'تخصص', 2, 54, 'مبادئ الإدارة والقيادة والتنظيم وتوزيع المهام وضمان الجودة في التمريض', 'award'),
  ('الإدارة والقيادة في التمريض (عملي)', 'Nursing Management and Leadership Practical (NURS 4334)', 'NURS 4334', 'تخصص', 2, 55, 'التطبيق الميداني للقيادة والإشراف الإداري على فرق التمريض والأقسام', 'check-circle'),
  ('متطلب اختياري (2)', 'Department Elective 2 (OPTI 4202)', 'OPTI 4202', 'تخصص', 2, 56, 'مساق اختياري تخصصي ثانٍ لتعميق المعرفة في مجالات التمريض المتقدمة', 'sparkles');

-- Map each subject to its corresponding academic year:
-- Sort orders 1 to 15: السنة الأولى (first_year)
insert into public.subject_academic_years (subject_id, academic_year_id)
select s.id, y.id
from public.subjects s
cross join public.academic_years y
where y.code = 'first_year' and s.sort_order between 1 and 15;

-- Sort orders 16 to 30: السنة الثانية (second_year)
insert into public.subject_academic_years (subject_id, academic_year_id)
select s.id, y.id
from public.subjects s
cross join public.academic_years y
where y.code = 'second_year' and s.sort_order between 16 and 30;

-- Sort orders 31 to 43: السنة الثالثة (third_year)
insert into public.subject_academic_years (subject_id, academic_year_id)
select s.id, y.id
from public.subjects s
cross join public.academic_years y
where y.code = 'third_year' and s.sort_order between 31 and 43;

-- Sort orders 44 to 56: السنة الرابعة (fourth_year)
insert into public.subject_academic_years (subject_id, academic_year_id)
select s.id, y.id
from public.subjects s
cross join public.academic_years y
where y.code = 'fourth_year' and s.sort_order between 44 and 56;
