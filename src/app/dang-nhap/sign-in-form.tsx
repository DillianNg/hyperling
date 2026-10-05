'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { useTranslations } from 'next-intl';
import { MailCheck, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sendMagicLink, type SignInState } from './actions';

const ERROR_KEY = {
  invalidEmail: 'errorInvalidEmail',
  rateLimit: 'errorRateLimit',
  generic: 'errorGeneric',
  notConfigured: 'notConfiguredBody',
} as const;

function SubmitButton() {
  const t = useTranslations('auth.signIn');
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? t('submitting') : t('submit')}
    </Button>
  );
}

export function SignInForm({ next, disabled = false }: { next?: string; disabled?: boolean }) {
  const t = useTranslations('auth.signIn');
  const [state, formAction] = useActionState<SignInState, FormData>(sendMagicLink, { status: 'idle' });

  if (state.status === 'sent') {
    return (
      <div className="rounded-card border border-success/40 bg-success-subtle p-6">
        <MailCheck className="size-6 text-success" aria-hidden="true" />
        <h2 className="mt-4 font-semibold">{t('sentTitle')}</h2>
        <p className="mt-2 text-[0.9375rem] text-fg-muted">{t('sentBody', { email: state.email })}</p>

        <form action={formAction} className="mt-5 flex flex-wrap gap-3">
          <input type="hidden" name="email" value={state.email} />
          {next ? <input type="hidden" name="tiep-tuc" value={next} /> : null}
          <Button type="submit" variant="outline" size="sm">
            {t('resend')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => window.location.reload()}>
            {t('useAnotherEmail')}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.status === 'error' ? (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-field border border-danger/40 bg-danger-subtle p-3.5 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
          <span>{t(ERROR_KEY[state.code])}</span>
        </p>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="email" className="block text-sm font-medium">
          {t('emailLabel')}
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          disabled={disabled}
          placeholder={t('emailPlaceholder')}
          aria-invalid={state.status === 'error' && state.code === 'invalidEmail'}
          aria-describedby={state.status === 'error' ? 'sign-in-error' : undefined}
        />
      </div>

      {next ? <input type="hidden" name="tiep-tuc" value={next} /> : null}

      <SubmitButton />
    </form>
  );
}
