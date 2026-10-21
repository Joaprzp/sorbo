import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "convex/react";
import { z } from "zod";
import { api } from "../../convex/_generated/api";

const schema = z.object({
  email: z.email("Ese email no parece válido"),
  website: z.string().optional(),
});

type Values = z.infer<typeof schema>;

export function WaitlistForm() {
  const join = useMutation(api.waitlist.join);
  const [sent, setSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  if (sent) {
    return (
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-azul/80 sm:text-sm">
        Anotado. Te avisamos cuando abrimos.
      </p>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    await join({ email: values.email, website: values.website });
    setSent(true);
  });

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-5 sm:flex-row sm:items-end"
    >
      <div className="max-w-md flex-1">
        <label
          htmlFor="email"
          className="block font-mono text-xs uppercase tracking-[0.16em] text-azul/80"
        >
          Lista de espera
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="tu@email.com"
          className="mt-2 w-full border-0 border-b border-azul/40 bg-transparent py-2 font-mono text-sm text-azul placeholder:text-azul/40 focus:border-azul focus:outline-none"
          {...register("email")}
        />
        {errors.email && (
          <p className="mt-2 font-mono text-xs text-azul/80">
            {errors.email.message}
          </p>
        )}
      </div>

      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
        {...register("website")}
      />

      <button
        type="submit"
        disabled={isSubmitting}
        className="bg-azul px-7 py-3 text-xs font-semibold uppercase tracking-[0.17em] text-nieve hover:bg-noche disabled:opacity-70"
      >
        Anotarse
      </button>
    </form>
  );
}
