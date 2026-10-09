import React, { useEffect, lazy, Suspense } from "react";
import { OfflineLibrary } from "./components/OfflineLibrary";
import { ThemeProvider } from "./context/ThemeContext";
import { ThemePicker } from "./components/common/ThemePicker";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { NavigationProvider, useNavigation } from "./context/NavigationContext";
import { NetworkProvider, useNetwork } from "./context/NetworkContext";
import {
  initNativePlugins,
  setupHardwareBackButton,
  setToastCallback,
} from "./services/capacitor";
import { useAppUpdateCheck } from "./hooks/useAppUpdateCheck";
import { UpdateModal } from "./components/UpdateModal";

// Layout & Common
import { MobileHeader } from "./components/layout/MobileHeader";
import { BottomNavigation } from "./components/layout/BottomNavigation";
import { OfflineScreen } from "./components/common/OfflineScreen";
import { Toast } from "./components/common/Toast";

// Screens
import { LoginScreen } from "./screens/LoginScreen";
import { RegisterScreen } from "./screens/RegisterScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { SubjectsScreen } from "./screens/SubjectsScreen";
import { SubjectDetailScreen } from "./screens/SubjectDetailScreen";
const ChatScreen = lazy(() =>
  import("./screens/ChatScreen").then((module) => ({
    default: module.ChatScreen,
  })),
);
import { ChatHistoryScreen } from "./screens/ChatHistoryScreen";
import { LibraryScreen } from "./screens/LibraryScreen";
import { StudyPackScreen } from "./screens/StudyPackScreen";
import { QuizRunner } from "./screens/QuizRunner";
import { QuizResultsScreen } from "./screens/QuizResultsScreen";
import { MistakesScreen } from "./screens/MistakesScreen";
import { ProgressScreen } from "./screens/ProgressScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { SubscriptionScreen } from "./screens/SubscriptionScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { Sparkles, RefreshCw } from "lucide-react";

function MainContent() {
  const { profile, loading, sessionUnverified, refreshAuth } = useAuth();
  const { currentScreen, toastMessage, showToast, switchTab } = useNavigation();
  const { isOnline, checkConnection } = useNetwork();
  const { hasUpdate, updateInfo, dismissUpdate } = useAppUpdateCheck();

  useEffect(() => {
    setToastCallback(showToast);
  }, [showToast]);

  useEffect(() => {
    if (profile && ["login", "register"].includes(currentScreen.name))
      switchTab("home");
  }, [profile, currentScreen.name, switchTab]);

  // An offline start shows the saved shell; verify the session once the network is back.
  useEffect(() => {
    if (isOnline && sessionUnverified) void refreshAuth();
  }, [isOnline, sessionUnverified, refreshAuth]);

  // If completely offline
  if (!isOnline && !profile) {
    return <OfflineScreen onRetry={refreshAuth} />;
  }

  // Initial Auth Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center space-y-4">
        <div className="flex size-16 items-center justify-center rounded-3xl bg-primary text-white shadow-xl shadow-primary/25">
          <Sparkles className="size-8" />
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
          <RefreshCw className="size-4 animate-spin text-primary" />
          <span>جارٍ التحقق من الجلسة...</span>
        </div>
      </div>
    );
  }

  // Unauthenticated Flow
  if (!profile) {
    return (
      <>
        <div className="absolute top-0 inset-x-0 pt-safe px-4 flex justify-end z-30">
          <ThemePicker />
        </div>
        {currentScreen.name === "register" ? (
          <RegisterScreen />
        ) : (
          <LoginScreen />
        )}
        <Toast message={toastMessage} />
        {hasUpdate && updateInfo && (
          <UpdateModal
            latestVersion={updateInfo.latest_version}
            latestVersionCode={updateInfo.latest_version_code}
            releaseNotes={updateInfo.release_notes}
            forceUpdate={updateInfo.force_update}
            apkUrl={updateInfo.apk_url}
            onDismiss={dismissUpdate}
          />
        )}
      </>
    );
  }

  // Header Title Resolver
  const getHeaderTitle = () => {
    switch (currentScreen.name) {
      case "home":
        return "Nursing AI";
      case "subjects":
        return "المواد الدراسية";
      case "subject-detail":
        return currentScreen.params?.subjectName || "المادة الدراسية";
      case "chat":
      case "chat-detail":
        return "المعلم الذكي";
      case "chat-history":
        return "سجل المحادثات";
      case "library":
        return "المكتبة التمريضية";
      case "study-pack":
        return currentScreen.params?.title || "حزمة الدراسة";
      case "quiz-runner":
        return currentScreen.params?.title || "الاختبار التدريبي";
      case "quiz-results":
        return "نتيجة الاختبار";
      case "mistakes":
        return "مراجعة أخطائي";
      case "progress":
        return "تقدم التعلم";
      case "profile":
        return "حسابي";
      case "subscription":
        return "اشتراكي والباقات";
      case "settings":
        return "الإعدادات";
      default:
        return "Nursing AI";
    }
  };

  const isFullscreenRunner = currentScreen.name === "quiz-runner";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col text-slate-900 dark:text-slate-100">
      {!isOnline && (
        <div
          role="status"
          className="fixed top-0 inset-x-0 z-50 bg-amber-100 text-amber-900 px-4 py-2 text-sm flex items-center justify-between"
        >
          <span>
            {sessionUnverified
              ? "أنت غير متصل. تظهر آخر بيانات محفوظة وقد لا تكون محدثة، والميزات التي تحتاج الإنترنت متوقفة حتى يعود الاتصال."
              : "الاتصال مقطوع؛ نشاطك الحالي محفوظ على الشاشة"}
          </span>
          <button className="min-h-11 px-2 font-bold" onClick={checkConnection}>
            إعادة المحاولة
          </button>
        </div>
      )}
      {/* Header */}
      {!isFullscreenRunner && <MobileHeader title={getHeaderTitle()} />}

      {/* Main Screen Container */}
      <main className="flex-1 px-4 pt-3 max-w-lg mx-auto w-full">
        {!isFullscreenRunner && <OfflineLibrary />}
        <Suspense
          fallback={
            <div role="status" className="py-12 text-center text-primary">
              جارٍ فتح المحادثة...
            </div>
          }
        >
          {currentScreen.name === "home" && <HomeScreen />}
          {currentScreen.name === "subjects" && <SubjectsScreen />}
          {currentScreen.name === "subject-detail" && (
            <SubjectDetailScreen subjectId={currentScreen.params?.subjectId} />
          )}
          {currentScreen.name === "chat" && <ChatScreen />}
          {currentScreen.name === "chat-detail" && (
            <ChatScreen
              key={
                currentScreen.params?.conversationId ||
                currentScreen.params?.lectureId ||
                currentScreen.params?.subjectId ||
                "new"
              }
              lectureId={currentScreen.params?.lectureId}
              conversationId={currentScreen.params?.conversationId}
              subjectId={currentScreen.params?.subjectId}
              subjectName={currentScreen.params?.subjectName}
            />
          )}
          {currentScreen.name === "chat-history" && <ChatHistoryScreen />}
          {currentScreen.name === "library" && <LibraryScreen />}
          {currentScreen.name === "study-pack" && (
            <StudyPackScreen
              id={currentScreen.params?.studyPackId || currentScreen.params?.id}
              type={currentScreen.params?.type}
              title={currentScreen.params?.title}
            />
          )}
          {currentScreen.name === "quiz-runner" && (
            <QuizRunner
              attemptId={currentScreen.params?.attemptId}
              quizId={currentScreen.params?.quizId}
              studyPackId={currentScreen.params?.studyPackId}
              questions={currentScreen.params?.questions}
              mode={currentScreen.params?.mode}
              title={currentScreen.params?.title}
            />
          )}
          {currentScreen.name === "quiz-results" && (
            <QuizResultsScreen
              scorePercent={currentScreen.params?.scorePercent}
              correctCount={currentScreen.params?.correctCount}
              totalQuestions={currentScreen.params?.totalQuestions}
              timeSpent={currentScreen.params?.timeSpent}
              results={currentScreen.params?.results}
            />
          )}
          {currentScreen.name === "mistakes" && <MistakesScreen />}
          {currentScreen.name === "progress" && <ProgressScreen />}
          {currentScreen.name === "profile" && <ProfileScreen />}
          {currentScreen.name === "settings" && <SettingsScreen />}
          {currentScreen.name === "subscription" && <SubscriptionScreen />}
        </Suspense>
      </main>

      {/* Bottom Nav */}
      {!isFullscreenRunner && <BottomNavigation />}

      {/* Toast */}
      <Toast message={toastMessage} />

      {/* In-App Update Modal */}
      {hasUpdate && updateInfo && (
        <UpdateModal
          latestVersion={updateInfo.latest_version}
          latestVersionCode={updateInfo.latest_version_code}
          releaseNotes={updateInfo.release_notes}
          forceUpdate={updateInfo.force_update}
          apkUrl={updateInfo.apk_url}
          onDismiss={dismissUpdate}
        />
      )}
    </div>
  );
}

export function App() {
  useEffect(() => {
    initNativePlugins();
    const cleanupBack = setupHardwareBackButton();
    return () => {
      cleanupBack();
    };
  }, []);

  return (
    <ThemeProvider>
      <NetworkProvider>
        <AuthProvider>
          <NavigationProvider>
            <MainContent />
          </NavigationProvider>
        </AuthProvider>
      </NetworkProvider>
    </ThemeProvider>
  );
}

export default App;
