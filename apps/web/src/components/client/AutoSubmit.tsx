"use client";
// Progressive enhancement: selects submit their GET form on change. Without JS the Apply button does it.
export function AutoSubmit({ formId }: { formId: string }) {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `(function(){var f=document.getElementById(${JSON.stringify(formId)});if(!f)return;f.querySelectorAll("select").forEach(function(s){s.addEventListener("change",function(){f.requestSubmit()})});var b=f.querySelector("[data-apply]");if(b)b.classList.add("sr-only")})()`,
      }}
    />
  );
}
