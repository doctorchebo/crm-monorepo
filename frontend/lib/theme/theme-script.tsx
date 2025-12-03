export function ThemeScript() {
  const themeScript = `
    try {
      const theme = localStorage.getItem('theme') || 'system';
      let finalTheme = 'light';
      
      if (theme === 'system') {
        finalTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      } else {
        finalTheme = theme;
      }
      
      if (finalTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    } catch (e) {}
  `;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: themeScript }}
      suppressHydrationWarning
    />
  );
}
