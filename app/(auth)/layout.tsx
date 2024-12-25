import { auth, signIn } from "@/auth";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  if (!session) {
    return signIn(undefined, { redirectTo: "/profile" });
  }

  return <>{children}</>;
}
