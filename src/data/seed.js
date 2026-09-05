/**
 * Seed content ported verbatim from the Claude Design prototype
 * ("Flashcard Reviewer.dc.html"). Shapes:
 *
 *   Deck = { id, title, subject, desc, studied, progress (0..1), cards: Card[] }
 *   Card = { front, back }
 */

export const DECKS = [
  { id:'republic', title:'Roman Republic: Institutions', subject:'Ancient Rome', desc:'Magistracies, assemblies and the unwritten rules that held the Republic together.', studied:'2 hours ago', progress:0.62, cards:[
    { front:'What were the two annually elected chief magistrates of the Republic?', back:'The consuls — two held office together for a single year, each able to veto the other.' },
    { front:'What was the cursus honorum?', back:'The ladder of public office — quaestor, aedile, praetor, consul — through which a senator advanced.' },
    { front:'Which magistracy was created in 494 BC to protect the plebeians?', back:'The tribune of the plebs. Ten were elected each year and their persons were sacrosanct.' },
    { front:'What did the tribunes\u2019 right of intercessio allow?', back:'To veto the act of any magistrate, or a decree of the Senate, on behalf of a citizen.' },
    { front:'What was a dictator in the Roman Republic?', back:'An extraordinary magistrate appointed in emergency, holding supreme authority for at most six months.' },
    { front:'What did the censors do?', back:'Elected every five years, they took the census, assigned citizens to tribes and classes, and revised the roll of the Senate.' },
    { front:'Distinguish imperium from potestas.', back:'Imperium was the power of military command and higher jurisdiction; potestas the ordinary power of office held by every magistrate.' },
    { front:'Which assembly elected the consuls and praetors?', back:'The comitia centuriata, voting in centuries weighted toward the wealthier property classes.' },
    { front:'What was a senatus consultum?', back:'A written resolution of the Senate — formally only advice to a magistrate, but binding in practice by custom.' },
    { front:'What did the Lex Hortensia of 287 BC establish?', back:'That plebiscites passed by the plebeian assembly bound the whole Roman people, patricians included.' },
    { front:'What was the mos maiorum?', back:'\u201CThe way of the ancestors\u201D — the unwritten body of custom and precedent that governed Roman public life.' },
    { front:'What was a provocatio?', back:'A citizen\u2019s appeal to the people against a magistrate\u2019s summary punishment.' }
  ]},
  { id:'punic', title:'The Punic Wars', subject:'Ancient Rome', desc:'Three wars with Carthage, 264–146 BC, and the making of an empire.', studied:'Yesterday', progress:0.41, cards:[
    { front:'When were the three Punic Wars fought?', back:'264–241 BC, 218–201 BC and 149–146 BC.' },
    { front:'What drew Rome into the First Punic War?', back:'A dispute over Messana in Sicily, which pulled Rome into direct conflict with Carthage.' },
    { front:'What was the corvus?', back:'A hinged boarding bridge on Roman ships that turned naval battles into infantry fights.' },
    { front:'Which battle of 216 BC was Hannibal\u2019s greatest victory?', back:'Cannae, where a double envelopment destroyed a far larger Roman army.' },
    { front:'Who defeated Hannibal at Zama in 202 BC?', back:'Publius Cornelius Scipio, thereafter called Africanus.' },
    { front:'What was the strategy of Fabius Maximus?', back:'Avoid pitched battle, shadow Hannibal and cut his supply — hence \u201CFabian\u201D tactics.' },
    { front:'How did the Third Punic War end?', back:'With the siege and destruction of Carthage in 146 BC; its territory became the province of Africa.' },
    { front:'What terms closed the Second Punic War?', back:'Carthage paid 10,000 talents over fifty years and could not wage war without Rome\u2019s consent.' }
  ]},
  { id:'emperors', title:'Emperors of the Principate', subject:'Ancient Rome', desc:'From Augustus to Constantine: succession, expansion and reform.', studied:'3 days ago', progress:0.18, cards:[
    { front:'Whose reign founded the Principate?', back:'Augustus, who held power from 27 BC to AD 14 under republican forms.' },
    { front:'What was the Year of the Four Emperors?', back:'AD 69 — Galba, Otho, Vitellius and finally Vespasian, who founded the Flavian dynasty.' },
    { front:'Which emperor walled northern Britain?', back:'Hadrian, from AD 122, across the Tyne–Solway isthmus.' },
    { front:'Who were the Five Good Emperors?', back:'Nerva, Trajan, Hadrian, Antoninus Pius and Marcus Aurelius.' },
    { front:'Under whom did the Empire reach its greatest extent?', back:'Trajan, after the annexation of Dacia and the eastern campaigns of AD 114–117.' },
    { front:'What was Diocletian\u2019s tetrarchy?', back:'Rule by two Augusti and two Caesares, dividing the Empire\u2019s administration from AD 293.' },
    { front:'Who issued the Edict of Milan, and when?', back:'Constantine I, in AD 313, granting toleration to Christians throughout the Empire.' },
    { front:'What did the Constitutio Antoniniana of AD 212 do?', back:'Caracalla granted Roman citizenship to nearly all free inhabitants of the Empire.' }
  ]},
  { id:'latin', title:'Latin Legal Terms', subject:'Roman law', desc:'Vocabulary for reading Gaius and the Digest.', studied:'5 days ago', progress:0.88, cards:[
    { front:'ius civile', back:'The law applying to Roman citizens alone.' },
    { front:'ius gentium', back:'Law held common to all peoples, applied between citizens and foreigners.' },
    { front:'pater familias', back:'The eldest male head of a household, holding legal power over its members and property.' },
    { front:'manumissio', back:'The formal freeing of a slave.' },
    { front:'usufructus', back:'The right to use and enjoy another\u2019s property without altering its substance.' },
    { front:'stipulatio', back:'A formal oral contract concluded by set question and answer.' }
  ]},
  { id:'city', title:'The City & Daily Life', subject:'Ancient Rome', desc:'Building technique, housing, baths and the rhythm of the Roman day.', studied:'A week ago', progress:0.33, cards:[
    { front:'What is opus caementicium?', back:'Roman concrete: lime mortar, volcanic ash and aggregate, poured into formwork.' },
    { front:'What made the Pantheon\u2019s dome possible?', back:'Graded aggregate, lighter toward the crown, with coffering to cut weight.' },
    { front:'What was an insula?', back:'A multi-storey urban apartment block, home to most of Rome\u2019s population.' },
    { front:'What were the thermae?', back:'Large public bath complexes, moving bathers through caldarium, tepidarium and frigidarium.' },
    { front:'What did an aedile oversee?', back:'Streets, markets, the water supply, and the public games.' },
    { front:'What was the cena?', back:'The main evening meal, taken reclining in the triclinium.' }
  ]},
  { id:'late', title:'Late Antiquity', subject:'Ancient Rome', desc:'Started from a reading list — no cards written yet.', studied:'Never', progress:0, cards:[] }
];

export const QUIZ = [
  { q:'In which year was Carthage destroyed?', options:['264 BC','202 BC','146 BC','44 BC'], answer:2, explain:'Scipio Aemilianus took the city at the close of the Third Punic War in 146 BC.' },
  { q:'Which magistrate could veto both a fellow officer and a decree of the Senate?', options:['The censor','The tribune of the plebs','The quaestor','The aedile'], answer:1, explain:'The tribune\u2019s intercessio extended to the acts of magistrates and to senatorial decrees.' },
  { q:'What was the maximum term of a Republican dictator?', options:['Six months','One year','Five years','For life'], answer:0, explain:'The office was deliberately short — six months, or until the emergency passed.' },
  { q:'Which battle of 216 BC destroyed a Roman army by double envelopment?', options:['Trebia','Lake Trasimene','Cannae','Zama'], answer:2, explain:'At Cannae Hannibal drew in the Roman centre and closed both wings around it.' },
  { q:'The Lex Hortensia made the decisions of which body binding on all Romans?', options:['The Senate','The comitia centuriata','The plebeian assembly','The college of censors'], answer:2, explain:'From 287 BC plebiscites bound patricians as well as plebeians.' },
  { q:'Who was the last of the Five Good Emperors?', options:['Antoninus Pius','Marcus Aurelius','Commodus','Hadrian'], answer:1, explain:'Marcus Aurelius closed the sequence; his son Commodus broke the pattern of adoptive succession.' },
  { q:'What is opus caementicium?', options:['A style of fresco','Roman concrete','A land survey','A form of contract'], answer:1, explain:'Lime, volcanic ash and aggregate — the material behind vaults, domes and harbours.' },
  { q:'In which year did the Constitutio Antoniniana extend citizenship?', options:['AD 117','AD 212','AD 293','AD 313'], answer:1, explain:'Caracalla issued it in AD 212, granting citizenship to nearly all free provincials.' }
];

/** Cards the import flow "drafts" from an uploaded file. */
export const DRAFTED = [
  { front:'Which province did Rome organise first, in 241 BC?', back:'Sicilia, after the First Punic War — the model for provincial administration.' },
  { front:'What was a proconsul?', back:'A former consul governing a province, holding imperium there for the length of his command.' },
  { front:'What was the publicani\u2019s role in the provinces?', back:'Private companies bid for the right to collect provincial taxes, keeping the surplus.' },
  { front:'What did a lex provinciae set out?', back:'The charter of a new province: its boundaries, taxes, courts and the standing of its cities.' },
  { front:'Which court tried provincial governors for extortion?', back:'The quaestio de repetundis, established in 149 BC to hear claims of misgovernment.' },
  { front:'What was the cursus publicus?', back:'The imperial relay system of roads, stations and horses that carried official traffic.' },
  { front:'Distinguish an imperial from a senatorial province.', back:'Augustus governed frontier provinces through his legates; the Senate drew lots for the peaceful interior ones.' },
  { front:'What was a civitas libera?', back:'A free city inside a province, keeping its own laws and magistrates under Roman oversight.' },
  { front:'Why was Aegyptus governed differently?', back:'It answered to an equestrian prefect appointed by the emperor, and senators needed leave to enter it.' },
  { front:'What was the annona?', back:'The grain supply of Rome, drawn largely from Africa and Egypt and administered by the state.' },
  { front:'What was a colonia?', back:'A settlement of Roman citizens, often veterans, planted in a province with full Roman civic institutions.' },
  { front:'What did Diocletian\u2019s reform do to the provinces?', back:'It roughly doubled their number and grouped them into dioceses under vicarii.' }
];

export const HUES = { republic: 132, punic: 248, emperors: 302, latin: 62, city: 196, late: 22 }

export const hueOf = (deck) =>
  HUES[deck.id] !== undefined
    ? HUES[deck.id]
    : (String(deck.id)
        .split('')
        .reduce((n, ch) => n + ch.charCodeAt(0), 0) *
        47) %
      360

export const accentOf = (deck) => `oklch(0.800 0.098 ${hueOf(deck)})`

/** Deck badge: Draft when empty, Mastered at 85%+, otherwise In progress. */
export const badgeFor = (deck) => {
  if (!deck.cards.length) {
    return { label: 'Draft', bg: 'var(--color-raised)', fg: 'var(--color-ink-3)', line: 'var(--color-line)' }
  }
  if (deck.progress >= 0.85) {
    return { label: 'Mastered', bg: 'var(--color-ok-soft)', fg: 'var(--color-ok)', line: 'var(--color-ok-line)' }
  }
  return { label: 'In progress', bg: 'var(--color-raised)', fg: 'var(--color-ink-2)', line: 'var(--color-line)' }
}

/** Spaced-repetition intervals surfaced in the "Scheduled" toast. */
export const DUE = { again: '10 minutes', good: '3 days', easy: '10 days' }

export const SUBJECT_SUGGESTIONS = ['Ancient Rome', 'Roman law']

export const uid = () => Math.random().toString(36).slice(2, 10)
