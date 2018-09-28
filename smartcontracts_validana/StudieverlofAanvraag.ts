import { Contract, InitQuery, CodeQuery, TemplateFieldType, Template, addr } from "../../contract";
import { Docent, Subsidie, Opleiding, Tarief, Budget, BudgetSector } from "./interfaces";

interface StudieverlofAanvraagTemplate {
	jaar: number;
}

type andOrOpFunction<T = boolean> = () => { result: T | undefined, unknown: string[], problems: string[] };

export default class StudieverlofAanvraagContract extends Contract<StudieverlofAanvraagTemplate> {
	public type: string = "StudieverlofAanvraag";
	public version: string = "1.0";
	public description: string = "Leraar vraagt studieverlof aan voor zijn werkgever.";

	public template: Template<StudieverlofAanvraagTemplate> = {
		jaar: { type: TemplateFieldType.uint, desc: "Het jaar waarvoor het wordt aangevraagt.", name: "Jaar" }
	};

	public async init(from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: InitQuery): Promise<void> {

	}

	public async code(payload: StudieverlofAanvraagTemplate, from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: CodeQuery): Promise<"OK" | string | void> {

		//Kijk of iets aan alle (sub)voorwaarden voldoet. Zo niet geef terug aan welke (sub)voorwaarden niet wordt voldaan.
		const and = (bro: string, ...args: Array<boolean | undefined | andOrOpFunction>) => {
			let unknown: string[] = []; //Alles wat nog onbekend is.
			let problems: string[] = []; //Alles waar niet aan wordt voldaan.
			let result: boolean | undefined = true;
			let badNonFunction: boolean = false;

			//Voor alle argumenten kijken of het een subfunctie is (die wordt uitgevoerd) of of het voldoet
			for (let arg of args) {
				if (typeof arg === "function") {
					const argResult = arg();
					unknown.push(...argResult.unknown);
					problems.push(...argResult.problems);
					arg = argResult.result;
				} else if (arg !== true) {
					badNonFunction = true;
				}
				if (arg === undefined && result !== false) { //Informatie ontbreekt nog, dus kan nog niet goedkeuren
					result = undefined;
				} else if (arg === false) { //Informatie geeft aan dat er niet wordt voldaan, ongeacht de rest
					result = false;
					//We willen in de foutmelding wel alles wat fout gaat, dus ga verder
				}
			}

			//Geef door aan welke onderdelen niet wordt voldaan
			if (badNonFunction) {
				if (result === undefined) {
					unknown.push(bro);
				} else if (result === false) {
					problems.push(bro);
				}
			}
			if (result === true) {
				unknown = [];
				problems = [];
			}

			return { result, unknown, problems };
		};
		//Kijk of iets aan een (sub)voorwaarden voldoet. Zo niet geef terug aan welke (sub)voorwaarden niet wordt voldaan.
		const or = (bro: string, ...args: Array<boolean | undefined | andOrOpFunction>) => {
			let unknown: string[] = []; //Alles wat nog onbekend is.
			let problems: string[] = []; //Alles waar niet aan wordt voldaan.
			let result: boolean | undefined = false;
			let badNonFunction: boolean = false;

			//Voor alle argumenten kijken of het een subfunctie is (die wordt uitgevoerd) of of het voldoet
			for (let arg of args) {
				if (typeof arg === "function") {
					const argResult = arg();
					arg = argResult.result;
					unknown.push(...argResult.unknown);
					problems.push(...argResult.problems);
				} else if (arg !== true) {
					badNonFunction = true;
				}
				if (arg === undefined) { //Informatie ontbreekt nog, dus kan nog niet goedkeuren
					result = undefined;
				} else if (arg === true) { //Informatie geeft aan dat er aan wordt voldaan, ongeacht de rest
					result = true;
					break; //We weten al dat het totaal goed is, dus ga niet verder.
				}
			}

			//Geef door aan welke onderdelen niet wordt voldaan
			if (badNonFunction) {
				if (result === undefined) {
					unknown.push(bro);
				} else if (result === false) {
					problems.push(bro);
				}
			}
			if (result === true) {
				unknown = [];
				problems = [];
			}

			return { result, unknown, problems };
		};
		//Kijk of iets ergens aan voldoet.
		const compare = <T>(bro: string, comp: (a: T, b: T) => boolean,
			a: T | undefined | andOrOpFunction<T | undefined>, b: T | undefined | andOrOpFunction<T | undefined>) => {
			let unknown: string[] = []; //Alles wat nog onbekend is.
			let problems: string[] = []; //Alles waar niet aan wordt voldaan.
			let result: boolean | undefined;
			if (typeof a === "function") {
				const tempa = a();
				a = tempa.result;
				unknown.push(...tempa.unknown);
				problems.push(...tempa.problems);
			}
			if (typeof b === "function") {
				const tempb = b();
				b = tempb.result;
				unknown.push(...tempb.unknown);
				problems.push(...tempb.problems);
			}

			if (a !== undefined && b !== undefined) {
				result = comp(a, b);
			}

			if (result === true) {
				unknown = [];
				problems = [];
			} else if (result === false) {
				problems.push(bro);
			} else {
				unknown.push(bro);
			}

			return { result, unknown, problems };
		};

		if (payload.jaar > 2147483647) {
			return "Ongeldig jaar.";
		}

		const aanvrager: Docent | undefined = (await query("SELECT", "docenten", "WHERE id = $1;", [from])).rows[0];
		if (aanvrager === undefined) {
			return "Alleen docenten kunnen een verlof aanvraag indienen voor hun werkgever.";
		}

		const subsidieAanvraag: Subsidie | undefined = (await query("SELECT", "subsidies",
			"WHERE docent = $1 AND jaar = $2 AND geannuleerd = false;", [from, payload.jaar])).rows[0];

		let opleidingVanAanvraag: Opleiding | undefined;
		if (subsidieAanvraag !== undefined) {
			opleidingVanAanvraag = (await query("SELECT", "opleidingen", "WHERE id = $1;", [subsidieAanvraag.opleiding])).rows[0];
		}

		/////////////////////////////////////////////////////////////////////////////////
		// B402
		/////////////////////////////////////////////////////////////////////////////////

		//B402.BR02
		let maxVergoedenVerlofuren: number | undefined;
		if (opleidingVanAanvraag !== undefined) {
			if (opleidingVanAanvraag.eigenschappen.bachelor === true) {
				maxVergoedenVerlofuren = 160;
			} else if (opleidingVanAanvraag.eigenschappen.deficiëntieopleiding === true) {
				maxVergoedenVerlofuren = 160;
			} else if (opleidingVanAanvraag.eigenschappen.master === true) {
				if (aanvrager.eigenschappen.sector === "PO") {
					maxVergoedenVerlofuren = 320;
				} else if (aanvrager.eigenschappen.sector === "PSO") {
					maxVergoedenVerlofuren = 320;
				} else if (aanvrager.eigenschappen.sector === "VSO") {
					maxVergoedenVerlofuren = 320;
				} else if (aanvrager.eigenschappen.sector === "VO") {
					maxVergoedenVerlofuren = 240;
				} else if (aanvrager.eigenschappen.sector === "BVE") {
					maxVergoedenVerlofuren = 240;
				} else if (aanvrager.eigenschappen.sector === "HBO") {
					maxVergoedenVerlofuren = 320;
				} else {
					//Onbekend
				}
			} else {
				//Onbekend
			}
		}

		//B402.BR01
		const studieVerlofUren = aanvrager.eigenschappen.fte === undefined || maxVergoedenVerlofuren === undefined ? undefined :
			maxVergoedenVerlofuren * //B402.BR01.2
			aanvrager.eigenschappen.fte; //B402.BR01.1

		/////////////////////////////////////////////////////////////////////////////////
		// B403
		/////////////////////////////////////////////////////////////////////////////////

		//B403.BR02-BR08
		const subsidieTarief: Tarief | undefined = (await query("SELECT", "tarief", "WHERE sector = $1 AND jaar = $2;",
			[aanvrager.eigenschappen.sector, payload.jaar])).rows[0];

		//B403.BR01
		const maximaalSubsidiebedragCenten: number | undefined = studieVerlofUren === undefined || subsidieTarief === undefined ? undefined :
			Math.round(subsidieTarief.tarief_centen * //B403.BR02.1
				studieVerlofUren); //B403.BR02.2

		/////////////////////////////////////////////////////////////////////////////////
		// B401
		/////////////////////////////////////////////////////////////////////////////////

		const correctSubsidieVerleent = () => or("B401.BR02",
			subsidieAanvraag !== undefined, //B401.BR02.1
			//We registreren ook subsidieaanvragen voor €0
			subsidieAanvraag !== undefined && subsidieAanvraag.bedrag_centen === 0 //B401.BR02.2
		);

		const rechtOpStudieVerlof = () => and("B401.BR01",
			aanvrager.werkgever !== undefined, //B401.BR01.1
			correctSubsidieVerleent //B401.BR01.2
		);

		/////////////////////////////////////////////////////////////////////////////////
		// Resultaat
		/////////////////////////////////////////////////////////////////////////////////

		//Extra: Moet binnen budget vallen
		const budgetSector: BudgetSector | undefined = aanvrager.eigenschappen.sector === "PO" || aanvrager.eigenschappen.sector === "PSO"
			|| aanvrager.eigenschappen.sector === "VSO" ? "POenPSOenVSO" : aanvrager.eigenschappen.sector;
		const budget: Budget | undefined = (await query("SELECT", "budget", "WHERE jaar = $1 AND sector = $2;",
			[payload.jaar, budgetSector])).rows[0];
		let beschikbareBudgetCenten: number | undefined;
		if (budget !== undefined && subsidieAanvraag !== undefined) {
			if (subsidieAanvraag.vervolg_aanvraag) {
				//Is een vervolg aanvraag, volledige budget is beschikbaar (- wat is uitgegeven)
				beschikbareBudgetCenten = budget.beschikbaar_totaal_centen - budget.uitgegeven_totaal_centen;
			} else {
				//Is een nieuwe aanvraag, vervolg budget van het totaal af halen
				beschikbareBudgetCenten = (budget.beschikbaar_totaal_centen - budget.beschikbaar_vervolg_centen) -
					//Gedeelte wat niet al is uitgegeven, maar alleen voor vervolg beschikbaar is.
					(budget.uitgegeven_totaal_centen - budget.uitgegeven_vervolg_centen);
			}
		}

		const toewijzen = and("B406.BR02",
			payload.jaar >= new Date(previousBlockTimestamp).getUTCFullYear(), //B406.BR02.1: B001
			rechtOpStudieVerlof, //B406.BR02.2: B401
			() => compare("B403", (a, b) => a > b, maximaalSubsidiebedragCenten, 0), //B406.BR02.3: B403
			//Extra: Mag maar 1 keer (per jaar)
			subsidieAanvraag === undefined ? undefined : subsidieAanvraag.studieverlof_aanvraagtijd === null,
			//Extra: Moet binnen budget vallen
			maximaalSubsidiebedragCenten === undefined || beschikbareBudgetCenten === undefined ?
				undefined : beschikbareBudgetCenten >= maximaalSubsidiebedragCenten
		);

		if (toewijzen.result === false) {
			//De aanvraag is afgewezen om de volgende redenen:
			return `Afgewezen: ${Array.from(new Set(toewijzen.problems)).toString()}`;
		} else if (toewijzen.result === undefined) {
			//De volgende informatie is nog onbekend, dus kan nog niet worden goedgekeurd:
			return `Ontbreekt: ${Array.from(new Set(toewijzen.unknown)).toString()}`;
		} else {
			//De aanvraag is goeggekeurd
			await query("UPDATE", "subsidies", "SET studieverlof_aanvraagtijd = $3, studieverlof_uren = $4, " +
				"studieverlof_bedragcenten = $5 WHERE docent = $1 AND jaar = $2 AND geannuleerd = false;",
				[from, payload.jaar, previousBlockTimestamp, studieVerlofUren, maximaalSubsidiebedragCenten]);
			await query("UPDATE", "budget", "SET uitgegeven_totaal_centen = uitgegeven_totaal_centen + $3, " +
				"uitgegeven_vervolg_centen = GREATEST(uitgegeven_vervolg_centen + $4, beschikbaar_vervolg_centen) " +
				"WHERE jaar = $1 AND sector = $2;",
				[payload.jaar, budgetSector, maximaalSubsidiebedragCenten, subsidieAanvraag!.vervolg_aanvraag ? maximaalSubsidiebedragCenten : 0]);
			return "OK";
		}
	}
}