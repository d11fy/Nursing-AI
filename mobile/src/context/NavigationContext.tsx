import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { registerBackHandler } from "../services/capacitor";

export type TabType = "home" | "subjects" | "chat" | "library" | "profile";

export interface ScreenState {
  name: string;
  params?: any;
}

interface NavigationContextType {
  activeTab: TabType;
  currentScreen: ScreenState;
  screenStack: ScreenState[];
  switchTab: (tab: TabType) => void;
  navigate: (screenName: string, params?: any) => void;
  goBack: () => void;
  replace: (screenName: string, params?: any) => void;
  canGoBack: boolean;
  activeModal: string | null;
  openModal: (modalId: string) => void;
  closeModal: () => void;
  isQuizActive: boolean;
  setIsQuizActive: (active: boolean) => void;
  showQuizExitConfirm: boolean;
  setShowQuizExitConfirm: (show: boolean) => void;
  toastMessage: string | null;
  showToast: (msg: string) => void;
}

const NavigationContext = createContext<NavigationContextType | null>(null);

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [activeTab, setActiveTab] = useState<TabType>("home");
  const [screenStack, setScreenStack] = useState<ScreenState[]>([{ name: "home" }]);
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [isQuizActive, setIsQuizActive] = useState(false);
  const [showQuizExitConfirm, setShowQuizExitConfirm] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const currentScreen = screenStack[screenStack.length - 1] || { name: activeTab };
  const canGoBack = screenStack.length > 1;

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 2000);
  }, []);

  const switchTab = useCallback((tab: TabType) => {
    setActiveTab(tab);
    setScreenStack([{ name: tab }]);
    setActiveModal(null);
  }, []);

  const navigate = useCallback((name: string, params?: any) => {
    setScreenStack((prev) => [...prev, { name, params }]);
  }, []);

  const replace = useCallback((name: string, params?: any) => {
    setScreenStack((prev) => {
      const next = [...prev];
      next[next.length - 1] = { name, params };
      return next;
    });
  }, []);

  const goBack = useCallback(() => {
    if (showQuizExitConfirm) {
      setShowQuizExitConfirm(false);
      return;
    }
    if (activeModal) {
      setActiveModal(null);
      return;
    }
    if (isQuizActive && currentScreen.name === "quiz-runner") {
      setShowQuizExitConfirm(true);
      return;
    }
    setScreenStack((prev) => {
      if (prev.length > 1) {
        return prev.slice(0, prev.length - 1);
      }
      return prev;
    });
  }, [activeModal, isQuizActive, currentScreen.name, showQuizExitConfirm]);

  const openModal = useCallback((id: string) => {
    setActiveModal(id);
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal(null);
  }, []);

  // Hardware Back Button Integration
  useEffect(() => {
    return registerBackHandler(() => {
      // 1. If Exit Quiz modal open -> close it
      if (showQuizExitConfirm) {
        setShowQuizExitConfirm(false);
        return true;
      }

      // 2. If any modal / bottom sheet is open -> close it
      if (activeModal) {
        setActiveModal(null);
        return true;
      }

      // 3. If quiz is running -> prompt before exiting
      if (isQuizActive && currentScreen.name === "quiz-runner") {
        setShowQuizExitConfirm(true);
        return true;
      }

      // 4. If in a stack of screens -> pop
      if (screenStack.length > 1) {
        setScreenStack((prev) => prev.slice(0, prev.length - 1));
        return true;
      }

      // 5. If at root of a non-home tab -> go to home tab
      if (activeTab !== "home") {
        switchTab("home");
        return true;
      }

      // 6. At home root -> allow default double tap to exit
      return false;
    });
  }, [activeModal, isQuizActive, currentScreen.name, screenStack.length, activeTab, switchTab, showQuizExitConfirm]);

  return (
    <NavigationContext.Provider
      value={{
        activeTab,
        currentScreen,
        screenStack,
        switchTab,
        navigate,
        goBack,
        replace,
        canGoBack,
        activeModal,
        openModal,
        closeModal,
        isQuizActive,
        setIsQuizActive,
        showQuizExitConfirm,
        setShowQuizExitConfirm,
        toastMessage,
        showToast,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error("useNavigation must be used within a NavigationProvider");
  }
  return context;
}
