import { createContext, useCallback, useContext, useMemo, useState, type PropsWithChildren } from 'react';

export type MainTab = 'history' | 'index' | 'profile';

export type MainUiContextValue = {
  cameraInView: boolean;
  setCameraInView: (visible: boolean) => void;
};

const MainUiContext = createContext<MainUiContextValue | null>(null);

export function MainUiProvider({ children }: PropsWithChildren) {
  const [cameraInView, setCameraInViewState] = useState(true);
  const setCameraInView = useCallback((visible: boolean) => {
    setCameraInViewState(visible);
  }, []);
  const value = useMemo(() => ({
    cameraInView,
    setCameraInView
  }), [cameraInView, setCameraInView]);

  return <MainUiContext.Provider value={value}>{children}</MainUiContext.Provider>;
}

export function useMainUi() {
  const context = useContext(MainUiContext);
  if (!context) throw new Error('useMainUi must be used inside MainUiProvider');
  return context;
}
