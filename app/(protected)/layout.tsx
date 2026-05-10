import { AppHeader } from "@/components/navigation/AppHeader";

export default function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <AppHeader />
      <main>{children}</main>
    </>
  );
}
