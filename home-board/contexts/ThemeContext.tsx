import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState } from "react";
import { Appearance } from "react-native";

const STORAGE_KEY = "@theme_preference";

interface ThemeContextValue {
  isDark: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: false,
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = useState(() => Appearance.getColorScheme() === "dark");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value !== null) {
        const dark = value === "dark";
        setIsDark(dark);
        Appearance.setColorScheme(dark ? "dark" : "light");
      }
    });
  }, []);

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    Appearance.setColorScheme(next ? "dark" : "light");
    AsyncStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
  }

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
