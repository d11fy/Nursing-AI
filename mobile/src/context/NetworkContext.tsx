import React, { createContext, useContext, useEffect, useState } from "react";
import { checkNetworkStatus, subscribeNetworkStatus } from "../services/capacitor";

interface NetworkContextType {
  isOnline: boolean;
  checkConnection: () => Promise<boolean>;
}

const NetworkContext = createContext<NetworkContextType>({
  isOnline: true,
  checkConnection: async () => true,
});

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    checkNetworkStatus().then(setIsOnline);
    const unsubscribe = subscribeNetworkStatus((connected) => {
      setIsOnline(connected);
    });
    return unsubscribe;
  }, []);

  const checkConnection = async () => {
    const status = await checkNetworkStatus();
    setIsOnline(status);
    return status;
  };

  return (
    <NetworkContext.Provider value={{ isOnline, checkConnection }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
