import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact SARTISTIC | Premium Mehndi" },
      {
        name: "description",
        content:
          "Questions about products, bulk orders or an upcoming celebration? Send the SARTISTIC team a message.",
      },
      { property: "og:title", content: "Contact SARTISTIC" },
      {
        property: "og:description",
        content: "Get in touch with the SARTISTIC team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Contact,
});

const schema = z.object({
  name: z.string().trim().min(1, "Please enter your name").max(100),
  email: z.string().trim().email("Enter a valid email address").max(255),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  subject: z.string().trim().max(150).optional().or(z.literal("")),
  message: z.string().trim().min(10, "Tell us a little more").max(1500),
});

function Contact() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = schema.safeParse(Object.fromEntries(form));
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please check the form");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("contact_messages").insert({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      subject: parsed.data.subject || null,
      message: parsed.data.message,
    });
    setBusy(false);
    if (error) {
      toast.error("We couldn't send your message. Please try again.");
      return;
    }
    setSent(true);
    toast.success("Message sent. We'll be in touch soon.");
  }

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-16 lg:px-10">
      <div className="grid gap-16 lg:grid-cols-[1fr_1.1fr]">
        <div>
          <p className="eyebrow">Contact</p>
          <h1 className="mt-3 text-5xl leading-[1.05] md:text-6xl">We'd love to hear from you</h1>
          <p className="mt-5 max-w-md text-muted-foreground">
            Questions about a product, an order or a large celebration? Send a note and our team
            will reply.
          </p>
          <dl className="mt-10 space-y-6 text-sm">
            <div>
              <dt className="eyebrow">Email</dt>
              <dd className="mt-1">hello@sartistic.example</dd>
            </div>
            <div>
              <dt className="eyebrow">Response time</dt>
              <dd className="mt-1">Within 1–2 business days</dd>
            </div>
          </dl>
        </div>

        {sent ? (
          <div className="flex flex-col items-start justify-center border border-border p-12">
            <p className="font-display text-3xl">Thank you</p>
            <p className="mt-3 text-muted-foreground">
              Your message has reached the studio. We'll reply to the email you provided.
            </p>
            <Button className="mt-8 rounded-none" onClick={() => setSent(false)}>
              Send another message
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5 border border-border p-8 lg:p-10">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Full name" name="name" required />
              <Field label="Email" name="email" type="email" required />
              <Field label="Phone (optional)" name="phone" />
              <Field label="Subject (optional)" name="subject" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" name="message" rows={6} required className="rounded-none" />
            </div>
            <Button type="submit" disabled={busy} className="h-12 w-full rounded-none">
              {busy ? "Sending…" : "Send Message"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} className="rounded-none" />
    </div>
  );
}
