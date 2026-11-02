"""Reminder scripts shared by the spreadsheet and the PDF guide (placeholder versions of the app's templates)."""
PAY = "\n\nPayment details:\n[How to pay you]"
SIGN = "\n\n[Your name]"
SCRIPTS = [
 dict(stage="1 · Heads-up", when="3 days before due", tone="Warm",
      subject="Invoice [#] due [due date]",
      email="Hi [Name],\n\nA quick heads-up that invoice [#] for [project] ([amount]) is due on [due date].\n\nThanks again, I really enjoyed working on this with you. Let me know if you need anything from me to process it."+PAY+"\n\nBest,"+SIGN,
      chat="Hi [Name]! Quick heads-up: invoice [#] ([amount]) is due on [due date]. Let me know if you need anything to process it. Thanks!"),
 dict(stage="2 · Due today", when="On the due date", tone="Neutral",
      subject="Invoice [#] is due today",
      email="Hi [Name],\n\nJust a reminder that invoice [#] for [amount] is due today, [due date].\n\nIf it's already on its way, thank you, and please ignore this."+PAY+"\n\nBest,"+SIGN,
      chat="Hi [Name], invoice [#] ([amount]) is due today. If it's already sent, thank you and please ignore this!"),
 dict(stage="3 · Friendly nudge", when="3 days late", tone="Assume it slipped",
      subject="Friendly reminder: invoice [#] ([amount])",
      email="Hi [Name],\n\nI hope you're well. I haven't seen payment for invoice [#] ([amount], due [due date]) come through yet, so I wanted to check it hasn't slipped through the cracks.\n\nCould you let me know when it's scheduled? I've attached the invoice again in case it's useful."+PAY+"\n\nThanks,"+SIGN,
      chat="Hi [Name], hope you're well! I haven't received payment for invoice [#] ([amount], due [due date]) yet. Could you check when it's scheduled? Happy to resend the invoice."),
 dict(stage="4 · Firm reminder", when="7 days late", tone="Clear deadline",
      subject="Invoice [#] is now [X] days overdue",
      email="Hi [Name],\n\nInvoice [#] for [amount] was due on [due date] and is now [X] days overdue.\n\nPlease arrange payment, or reply with the date it will be paid, by [date 3 days from now]. If there's a problem with the invoice or the work, tell me and I'll sort it out quickly."+PAY+"\n\nThank you,"+SIGN,
      chat="Hi [Name], invoice [#] ([amount]) is now [X] days overdue. Could you pay it, or tell me the payment date, by [date]? If there's an issue with it, let me know and I'll fix it."),
 dict(stage="5 · Final notice", when="14 days late", tone="Consequence",
      subject="Final reminder: invoice [#] ([amount])",
      email="Hi [Name],\n\nThis is a final reminder that invoice [#] for [amount], due on [due date], is still unpaid [X] days later.\n\nAs set out in our agreed terms, a late fee of [late fee] now applies. Please make payment by [date 3 days from now]. If I don't hear back by then I'll need to look at next steps, which I'd much rather avoid."+PAY+"\n\nRegards,"+SIGN,
      chat="Hi [Name], final reminder: invoice [#] ([amount]) is [X] days overdue. Per our terms a late fee of [late fee] now applies. Please pay by [date], or I'll need to look at next steps."),
 dict(stage="6 · Pause work", when="30 days late", tone="Stop and escalate",
      subject="Invoice [#]: work paused until payment",
      email="Hi [Name],\n\nInvoice [#] for [amount] is now [X] days overdue, and I haven't been able to get a payment date.\n\nI'm pausing any further work and deliverables until the balance is settled. If it's not paid by [date], I'll move to formal recovery.\n\nI'd still like to resolve this directly. If you can't pay in full, reply and propose a payment plan and I'll consider it."+PAY+"\n\nRegards,"+SIGN,
      chat="Hi [Name], invoice [#] ([amount]) is now [X] days overdue. I'm pausing further work until it's settled. If it's not paid by [date] I'll move to formal recovery. If you need a payment plan, reply and we can agree one."),
]
