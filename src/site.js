// No framework or WordPress runtime is needed for these small enhancements.
document.addEventListener('submit', event => {
 const form = event.target;
 if (!(form instanceof HTMLFormElement) || !form.matches('.editorial-form')) return;
 event.preventDefault();
 let message = form.querySelector('.form-status');
 if (!message) { message = document.createElement('p');message.className='form-status';message.setAttribute('role','status');form.append(message); }
 message.textContent=document.documentElement.lang.startsWith('fr')
 ? 'L’envoi n’est pas encore disponible. Veuillez contacter assistant@zermattsummit.org.'
 : 'Sending is not available yet. Please contact assistant@zermattsummit.org.';
});
for (const list of document.querySelectorAll('[data-filter-list]')) {
 const input = list.querySelector('input[type="search"]');
 const cards = [...list.querySelectorAll('.card')];
 const counter = list.querySelector('.result-count');
 input?.addEventListener('input', () => {
  const normalize = value => value.toLocaleLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  const query = normalize(input.value.trim());
  let count = 0;
  for (const card of cards) {card.hidden = !normalize(card.dataset.search).includes(query);if (!card.hidden) count++;}
  if(counter)counter.textContent = `${count} ${document.documentElement.lang.startsWith('fr')?(count===1?'résultat':'résultats'):(count===1?'result':'results')}`;
  const empty=list.querySelector('.no-results');if(empty)empty.hidden=count!==0;
 });
}
