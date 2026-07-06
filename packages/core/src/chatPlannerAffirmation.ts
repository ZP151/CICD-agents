/** Returns true if the message is a user affirmation (yes/proceed/action-forward). */
export function isConfirmationMessage(msg: string): boolean {
  const t = msg.trim().toLowerCase().replace(/[.!?，。！？]+$/, "").trim();
  if (/^(yes|y|yep|yeah|proceed|go ahead|do it|do that|continue|sure|ok|okay|confirm|run it|execute|sounds good|let's go|let's do it|go|start|begin|approve|approved|accepted|agreed|correct|right|perfect|great|good|fine)$/.test(t)) return true;
  if (/^(stage|stage (all|them|it|changes|everything|the (files|changes))|git add|add all|commit|commit (all|them|it|the changes)|push|push (it|them|the branch|to remote|origin)|create (the |a )?pr|open (the |a )?pr|create (the |a )?pull request)(\s+(and\s+)?(stage|commit|push|create pr|open pr))*$/.test(t)) return true;
  if (/^(go ahead|please do|please proceed|please (stage|commit|push)|yes please|sounds good|looks good|do (the )?stage|do (the )?commit|do (the )?push)/.test(t)) return true;
  return false;
}

/** Returns true if the message is a user denial (no / cancel / etc.) */
export function isDenialMessage(msg: string): boolean {
  return /^\s*(no|n|nope|cancel|stop|not now|do not|don't|skip|abort|never mind|nevermind|hold on|wait)\s*[.!?]*\s*$/i.test(
    msg.trim(),
  );
}
