import type { ToolHandlers } from "#video/adapter/types";

type SearchMoment = Readonly<{
  title: string;
  start_seconds: number;
  end_seconds: number;
  evidence: string;
  moment_ref: string;
  expires_at: string;
  open_url: string;
}>;

function button(label: string, action: () => void, secondary = false): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  if (secondary) element.className = "secondary";
  element.addEventListener("click", action);
  return element;
}

export function mountFlowPanel(container: HTMLElement, handlers: ToolHandlers): void {
  const heading = document.createElement("h2");
  heading.textContent = "Try the three-tool flow";
  const form = document.createElement("form");
  const query = document.createElement("input");
  query.name = "query";
  query.value = "motorized exoskeleton";
  query.setAttribute("aria-label", "Question or search terms");
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Find exact moment";
  form.append(query, submit);
  const output = document.createElement("div");
  output.className = "result";
  output.textContent = "Search results will appear here.";
  let renderGeneration = 0;

  const renderMoment = (moment: SearchMoment) => {
    const title = document.createElement("h3");
    title.textContent = moment.title;
    const evidence = document.createElement("p");
    evidence.textContent = `${moment.start_seconds}–${moment.end_seconds} seconds. ${moment.evidence}`;
    const actions = document.createElement("div");
    actions.className = "actions";
    const contextButton = button("Show context", () => {
      void handlers.get_moment_context({ moment_ref: moment.moment_ref }, {
        signal: new AbortController().signal,
      }).then((result) => {
        const context = result as { visual_description: string };
        const text = document.createElement("p");
        text.textContent = context.visual_description;
        output.append(text);
      }).catch((error: unknown) => {
        output.textContent = error instanceof Error ? error.message : "context_failed";
      });
    }, true);
    const playButton = button("Play moment", () => {
      const generation = ++renderGeneration;
      void handlers.play_moment({ moment_ref: moment.moment_ref }, {
        signal: new AbortController().signal,
      }).then((result) => {
        if (generation !== renderGeneration) return;
        const play = result as { status: string };
        const status = document.createElement("p");
        status.dataset.playStatus = play.status;
        status.textContent = `Local player result: ${play.status}.`;
        output.append(status);
      }).catch((error: unknown) => {
        if (generation !== renderGeneration) return;
        const status = document.createElement("p");
        status.dataset.playStatus = "error";
        status.textContent = error instanceof Error ? error.message : "play_failed";
        output.append(status);
      });
    });
    const link = document.createElement("a");
    link.className = "moment-link secondary";
    link.href = moment.open_url;
    link.rel = "noopener noreferrer";
    link.target = "_blank";
    link.textContent = "Open moment";
    actions.append(contextButton, playButton, link);
    output.replaceChildren(title, evidence, actions);
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void handlers.search_this_catalog({ query: query.value, limit: 3 }, {
      signal: new AbortController().signal,
    }).then((result) => {
      const moments = (result as { moments: SearchMoment[] }).moments;
      if (moments[0]) renderMoment(moments[0]);
      else output.textContent = "No rights-cleared moment matched.";
    }).catch((error: unknown) => {
      output.textContent = error instanceof Error ? error.message : "search_failed";
    });
  });

  container.replaceChildren(heading, form, output);
}
