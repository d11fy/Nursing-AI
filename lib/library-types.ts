export const RESOURCE_CATEGORIES = [
  { value: "curriculum_book", label: "كتب المنهج" },
  { value: "university_lecture", label: "محاضرات الجامعة" },
  { value: "summary", label: "ملخصات" },
  { value: "previous_exam", label: "امتحانات سابقة" },
  { value: "exam_model", label: "نماذج امتحانات" },
  { value: "question_bank", label: "بنك أسئلة" },
  { value: "explanation", label: "شروحات" },
  { value: "notes", label: "ملاحظات" },
  { value: "lab_material", label: "مختبر / عملي" },
  { value: "other", label: "مصادر أخرى" },
] as const;

export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number]["value"];

export type LibraryResource = {
  id: string;
  title: string;
  description: string | null;
  category: ResourceCategory;
  subjectId: string | null;
  subjectName: string | null;
  academicYearId: string | null;
  academicYearName: string | null;
  semester: number | null;
  language: string | null;
  sourceLabel: string | null;
  pageCount: number;
  sortOrder: number;
  favorite?: boolean;
};

export type ActiveLibrarySource = Pick<LibraryResource, "id" | "title" | "category" | "subjectId" | "subjectName" | "sourceLabel">;

export type LibraryCatalog = {
  resources: LibraryResource[];
  recent: LibraryResource[];
  subjects: Array<{ id: string; name: string; semester: number | null; count: number }>;
  categoryCounts: Partial<Record<ResourceCategory, number>>;
  academicYear: { id: string; name: string } | null;
  total: number;
  page: number;
  pageSize: number;
};

export function categoryLabel(category: ResourceCategory) {
  return RESOURCE_CATEGORIES.find((item) => item.value === category)?.label ?? "مصدر دراسي";
}
