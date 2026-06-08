import { redirect } from "next/navigation";

export default async function VerifyPage({ searchParams }) {
  const params = await searchParams;
  const token = params?.token;

  if (!token) {
    redirect("/?authError=Missing%20verification%20link.");
  }

  redirect(`/api/auth/verify?token=${encodeURIComponent(token)}`);
}
