import { Contract, InitQuery, CodeQuery, TemplateFieldType, Template, addr } from "../../contract";
import { Docent, School, Opleiding, Subsidie, Budget, BudgetSector } from "./interfaces";

interface SubsidieAanvraagTemplate {
	opleiding: string;
	jaar: number;
}

type andOrOpFunction<T = boolean> = () => { result: T | undefined, unknown: string[], problems: string[] };

export default class SubsidieAanvraagContract extends Contract<SubsidieAanvraagTemplate> {
	public type: string = "SubsidieAanvraag";
	public version: string = "1.1";
	public description: string = "Leraar vraagt een subsidie aan.";

	public template: Template<SubsidieAanvraagTemplate> = {
		opleiding: { type: TemplateFieldType.hash, desc: "De opleiding waarvoor een subsidie wordt aangevraagt.", name: "Opleiding" },
		jaar: { type: TemplateFieldType.uint, desc: "Het jaar waarvoor het wordt aangevraagt.", name: "Jaar" }
	};

	public async init(from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: InitQuery): Promise<void> {

		await query("CREATE", "subsidies", "(docent VARCHAR(35) NOT NULL REFERENCES docenten (id), " +
			"opleiding BYTEA NOT NULL REFERENCES opleidingen (id), jaar INT NOT NULL, aanvraag_tijd BIGINT NOT NULL, " +
			"geannuleerd BOOLEAN NOT NULL DEFAULT false);", []);

		//Voor oude aanvragen zetten we het bedrag op 0 en de sector op PO.
		await query("ALTER", "subsidies", "ADD COLUMN IF NOT EXISTS bedrag_centen INT NOT NULL DEFAULT 0;", []);
		await query("ALTER", "subsidies", "ALTER bedrag_centen DROP DEFAULT;", []);
		await query("ALTER", "subsidies", "ADD COLUMN IF NOT EXISTS sector VARCHAR(32) NOT NULL DEFAULT 'PO';", []);
		await query("ALTER", "subsidies", "ALTER sector DROP DEFAULT;", []);
		await query("ALTER", "subsidies", "ADD COLUMN IF NOT EXISTS vervolg_aanvraag BOOLEAN NOT NULL DEFAULT false;", []);
		await query("ALTER", "subsidies", "ADD COLUMN IF NOT EXISTS studieverlof_aanvraagtijd BIGINT;", []);
		await query("ALTER", "subsidies", "ADD COLUMN IF NOT EXISTS studieverlof_uren REAL;", []);
		await query("ALTER", "subsidies", "ADD COLUMN IF NOT EXISTS studieverlof_bedragcenten INT;", []);
	}

	public async code(payload: SubsidieAanvraagTemplate, from: addr, block: number, processor: addr, previousBlockTimestamp: number,
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

		//Opleiding die wordt aangevraagt
		const binaryOpleiding = Buffer.from(payload.opleiding, "hex");
		const studie: Opleiding | undefined = (await query("SELECT", "opleidingen", "WHERE id = $1;", [binaryOpleiding])).rows[0];
		if (studie === undefined) {
			return "Aangevraagde opleiding bestaat niet.";
		}

		//De aanvrager
		const aanvrager: Docent | undefined = (await query("SELECT", "docenten", "WHERE id = $1;", [from])).rows[0];
		if (aanvrager === undefined) {
			return "Vraag uw (ex-)werkgever om u als leraar toe te voegen om een subsidieaanvraag te kunnen doen.";
		}

		//Alle subsidies die je hebt aangevraagt (exclusief huidige aanvraag en geannnuleerde aanvragen)
		const subsidies: Array<Subsidie & Opleiding> = (await query("SELECT", "subsidies", "JOIN opleidingen ON " +
			"subsidies.opleiding = opleidingen.id WHERE docent = $1 AND geannuleerd = false;", [from])).rows;
		//Alle subsidies voor de huidige opleiding gesorteerd op jaar
		const huidigeSubsidies = subsidies
			.filter((subsidie) => subsidie.opleiding.equals(binaryOpleiding))
			.sort((subsidie1, subsidie2) => subsidie1.jaar - subsidie2.jaar);
		const vervolgAanvraag = huidigeSubsidies.length !== 0;
		//Alle oude subsidies en opleidingen
		const oudeSubsidies = subsidies.filter((subsidie) => !subsidie.opleiding.equals(binaryOpleiding));
		const aantalOudeOpleidingen = new Set(oudeSubsidies.map((oudeSubsidie) => oudeSubsidie.opleiding)).size;

		/////////////////////////////////////////////////////////////////////////////////
		// B004
		/////////////////////////////////////////////////////////////////////////////////

		const studieVoldoet = () => and("B004.BR01",
			studieVoldoetOpleidingssoort, //B004.BR01.1
			studieJuisteLand, //B004.BR01.2
			studieJuisteStatus //B004.BR01.3
		);

		const studieVoldoetOpleidingssoort = () => or("B004.BR02",
			studie.eigenschappen.bachelor, //B004.BR02.1
			studie.eigenschappen.master, //B004.BR02.2
			studie.eigenschappen.deficiëntieopleiding //B004.BR02.3
		);

		const studieJuisteLand = () => or("B004.BR03",
			studie.eigenschappen.inNederland, //B004.BR03.1
			studie.eigenschappen.inEU, //B004.BR03.2
			studie.eigenschappen.inAruba, //B004.BR03.3
			studie.eigenschappen.inSintMaarten, //B004.BR03.4
			studie.eigenschappen.inCuraçao //B004.BR03.5
		);

		const studieJuisteStatus = () => or("B004.BR04",
			studie.eigenschappen.NufficGelijkwaardigVerklaardeBuitenlands, //B004.BR04.1
			studie.eigenschappen.NVOgeaccrediteerd //B004.BR04.2
		);

		/////////////////////////////////////////////////////////////////////////////////
		// B003
		/////////////////////////////////////////////////////////////////////////////////

		const voorwaardenAantalKeerSubsidieAangevraagd = () => {
			return and("B003.BR01",
				() => compare("B003.BR01.1", (a, b) => a > b, maximaalSubsiedieJaren, aantalVerstrekenSubsidiejaren()),
				() => compare("B003.BR01.2", (a, b) => a <= b, payload.jaar, uitersteSubsidiejaar),
				maximaalOpleidingenSubsidie, //B003.BR01.3
				subsidies.find((subsidie) => subsidie.jaar === payload.jaar) === undefined); //Toevoeging: Mag 1 subsidie per jaar
		};

		const maximaalSubsiedieJaren = () => { //B003.BR02
			let result: number | undefined;
			if (studie.eigenschappen.EC !== undefined) {
				if (studie.eigenschappen.EC >= 30 && studie.eigenschappen.EC < 60) {
					result = 1;
				} else if (studie.eigenschappen.EC === 60) {
					result = 2;
				} else if (studie.eigenschappen.EC > 60) {
					result = 3;
				} else {
					result = 0;
				}
			}
			return { result, unknown: result === undefined ? ["B003.BR02"] : [], problems: [] };
		};

		const aantalVerstrekenSubsidiejaren = () => huidigeSubsidies.filter((subsidie) => and("B003.BR03",
			() => subsidieIsToegekent(subsidie), //B003.BR03.1
			() => subsidieIsVerbruikt(subsidie) //B003.BR03.2
		)).length;

		const subsidieIsToegekent = (subsidie: Subsidie) => or("B003.BR04",
			subsidie !== undefined, //B003.BR04.1, subsidies worden gelijk toegekent dus bekijk toegekende subsidies
			oudeSubsidies.some((opleiding) => opleiding.eigenschappen.deficiëntieopleiding === true) //B003.BR04.2
		);

		const subsidieIsVerbruikt = (subsidie: Subsidie) => and("B003.BR05",
			subsidie !== undefined, //B003.BR05.1, subsidies worden gelijk toegekent dus bekijk toegekende subsidies
			!subsidie.geannuleerd //B003.BR05.2, we selecteren al geen geannuleerde aanvragen want 'deze hebben nooit plaatsgevonden'
		);

		const uitersteSubsidiejaar = () => { //B003.BR06
			const periode = beursperiode();
			if (periode.result === undefined) {
				return periode;
			} else {
				const result = (vervolgAanvraag ? huidigeSubsidies[0].jaar : payload.jaar) //B003.BR06.1
					+ periode.result; //B003.BR06.2
				return { result, unknown: [], problems: [] };
			}
		};

		const beursperiode = () => { //B003.BR07
			let result: number | undefined;
			if (studie.eigenschappen.EC !== undefined) {
				if (studie.eigenschappen.EC >= 30 && studie.eigenschappen.EC < 60) {
					result = 0; //Hier heb je een off-by-one error als je het schema volgt
				} else if (studie.eigenschappen.EC === 60) {
					result = 3;
				} else if (studie.eigenschappen.EC > 60) {
					result = 5;
				} else {
					result = 0;
				}
			}
			return { result, unknown: result === undefined ? ["B003.BR07"] : [], problems: [] };
		};

		const maximaalOpleidingenSubsidie = () => or("B003.BR08",
			aantalOudeOpleidingen === 0, //B003.BR08.1
			//Als het aantal oude opleidingen 1 is gaan alle oude subsidies over dezelfde opleiding, dus pak gewoon de eerste
			aantalOudeOpleidingen !== 1 ? false : studie.eigenschappen.master === undefined ? undefined :
				studie.eigenschappen.master && oudeSubsidies[0].eigenschappen.bachelor!, //B003.BR08.2
			aantalOudeOpleidingen !== 1 ? false : studie.eigenschappen.master === undefined ? undefined :
				studie.eigenschappen.master && oudeSubsidies[0].eigenschappen.deficiëntieopleiding!, //B003.BR08.3
			false //B003.BR08.4 wordt niet meegenomen, zie issue #50
		);

		//B003.BR09 & B003.BR10 worden niet meegenomen, zie issue #50

		/////////////////////////////////////////////////////////////////////////////////
		// B002
		/////////////////////////////////////////////////////////////////////////////////

		const correcteAanvrager = () => and("B002.BR01",
			aanvrager.eigenschappen.voldoetAanBevoegdheidseisen, //B002.BR01.1
			aanvrager.eigenschappen.graadBachalorVoeren, //B002.BR01.2
			voorwaardenDienstverband, //B002.BR01.3
			voorwaardenAantalKeerSubsidieAangevraagd, //B002.BR01.4
			voorwaardenWerkzaamheden //B002.BR01.5
		);

		const twaalfMaandenTerug = new Date(previousBlockTimestamp);
		twaalfMaandenTerug.setUTCMonth(twaalfMaandenTerug.getUTCMonth() - 12);
		if (aanvrager.eigenschappen.verledenDienstverbanden === undefined) {
			aanvrager.eigenschappen.verledenDienstverbanden = [];
		}
		const afgelopen12MaandenWerkgevers = aanvrager.eigenschappen.verledenDienstverbanden.filter((dienstVerband) =>
			dienstVerband.eindDatum > twaalfMaandenTerug.getTime()); //B002.BR04.2

		const voorwaardenDienstverband = () => or("B002.BR02", //Zelfde als B002.BR04, zie issue #51
			aanvrager.werkgever !== null, //B002.BR02.1
			afgelopen12MaandenWerkgevers.length > 0 //B002.BR02.2
		);

		const alleWerkgevers = afgelopen12MaandenWerkgevers.map((dienstverband) => dienstverband.werkgever);
		if (aanvrager.werkgever !== null) {
			alleWerkgevers.push(aanvrager.werkgever);
		}
		const werkgevers: School[] = (await query("SELECT", "scholen", "WHERE id = ANY($1);", [alleWerkgevers])).rows;

		const voorwaardenWerkzaamheden = () => and("B002.BR03",
			voorwaardenRecenteWerkzaamheden, //B002.BR03.1
			voorwaardenWerkindeling, //B002.BR03.2
			//We kijken of er minimaal 1 voldoet, gezien de 'onderwijsWerkgever' naar meerdere kan verwijzen
			() => or("B002.BR08", ...werkgevers.map((werkgever) => onderwijsWerkgeverVoldoet(werkgever))) //B002.BR03.3
		);

		const voorwaardenRecenteWerkzaamheden = () => or("B002.BR04",
			aanvrager.werkgever !== null, //B002.BR04.1
			afgelopen12MaandenWerkgevers.length > 0 //B002.BR04.2
		);

		const voorwaardenWerkindeling = () => or("B002.BR05",
			voorwaardenWerktijd, //B002.BR05.1
			uitgezonderdeFunctie //B002.BR05.2
		);

		const voorwaardenWerktijd = () => and("B002.BR06",
			aanvrager.eigenschappen.twintigProcentLesgebondenTaken, //B002.BR06.1
			aanvrager.eigenschappen.pedagogischDidactischVerantwoordelijk //B002.BR06.2
		);

		const uitgezonderdeFunctie = () => or("B002.BR07",
			aanvrager.eigenschappen.ambulantBegeleider, //B002.BR07.1
			aanvrager.eigenschappen.zorgcoördinator, //B002.BR07.2
			aanvrager.eigenschappen.interneBegeleider, //B002.BR07.3
			aanvrager.eigenschappen.remedialTeacher //B002.BR07.4
		);

		const onderwijsWerkgeverVoldoet = (werkgever: School) => //B002.BR08 word al in SchoolAanpassen gedaan, controleer hier alleen het resultaat
			werkgever.laatst_voldeed !== null && ( //Deze werkgever heeft ooit voldaan
				werkgever.laatst_voldeed >= twaalfMaandenTerug.getTime() || //Dit was in de afgelopen 12 maanden
				werkgever.laatst_voldeed > werkgever.laatst_niet_voldeed); //Of is nog steeds het geval

		/////////////////////////////////////////////////////////////////////////////////
		// B006
		/////////////////////////////////////////////////////////////////////////////////

		let maxSubsidieBedragCenten: number | undefined;
		//B006.BR05: Kan per jaar bedrag instellen
		const maxTeVergoedenCollegegeld: { jaar: number, bedrag_centen: number } | undefined =
			(await query("SELECT", "max_vergoed_collegegeld", "WHERE jaar = $1;", [payload.jaar])).rows[0];

		if (maxTeVergoedenCollegegeld !== undefined && studie.eigenschappen.collegeGeldCenten !== undefined) {
			const maxCollegeGeldCenten = Math.min( //B006.BR2
				studie.eigenschappen.collegeGeldCenten, //B006.BR2.1
				maxTeVergoedenCollegegeld.bedrag_centen //B006.BR2.2
			);

			const percentageCollegegeld = 10; //B006.BR9

			const variableVergoedingCenten = Math.round( //B006.BR6
				studie.eigenschappen.collegeGeldCenten * //B006.BR6.1
				percentageCollegegeld / 100); //B006.BR6.2

			const maxVergoedeReiskostenCenten = 350 * 100; //B006.BR8

			const maxReiskostenCenten = Math.min( //B006.BR4
				variableVergoedingCenten, //B006.BR4.1
				maxVergoedeReiskostenCenten //B006.BR4.2
			);

			const maxVergoedeStudiemiddelenCenten = 350 * 100; //B006.BR7

			const maxStudieMiddelenCenten = Math.min( //B006.BR3
				variableVergoedingCenten, //B006.BR3.1
				maxVergoedeStudiemiddelenCenten //B006.BR3.2
			);

			maxSubsidieBedragCenten = maxCollegeGeldCenten + maxReiskostenCenten + maxStudieMiddelenCenten; //B006.BR1;
		}

		/////////////////////////////////////////////////////////////////////////////////
		// B101
		/////////////////////////////////////////////////////////////////////////////////

		const budgetSector: BudgetSector | undefined = aanvrager.eigenschappen.sector === "PO" || aanvrager.eigenschappen.sector === "PSO"
			|| aanvrager.eigenschappen.sector === "VSO" ? "POenPSOenVSO" : aanvrager.eigenschappen.sector;

		//B001.BR01: beschikbare budget begint als subsidieplafond, wordt telkens verlaagt als subsidie wordt toegekent
		const budget: Budget | undefined = (await query("SELECT", "budget", "WHERE jaar = $1 AND sector = $2;",
			[payload.jaar, budgetSector])).rows[0];

		const beschikbareBudgetCenten = () => {
			let result: number | undefined;

			if (budget !== undefined) {
				if (vervolgAanvraag) {
					//Is een vervolg aanvraag, volledige budget is beschikbaar (- wat is uitgegeven)
					result = budget.beschikbaar_totaal_centen - budget.uitgegeven_totaal_centen;
				} else {
					//Is een nieuwe aanvraag, vervolg budget van het totaal af halen
					result = (budget.beschikbaar_totaal_centen - budget.beschikbaar_vervolg_centen) -
						//Gedeelte wat niet al is uitgegeven, maar alleen voor vervolg beschikbaar is.
						(budget.uitgegeven_totaal_centen - budget.uitgegeven_vervolg_centen);
				}
			}

			return { result, unknown: result === undefined ? ["B001.BR01"] : [], problems: [] };
		};

		/////////////////////////////////////////////////////////////////////////////////
		// Resultaat
		/////////////////////////////////////////////////////////////////////////////////

		const toewijzen = and("B008.BR02",
			payload.jaar >= new Date(previousBlockTimestamp).getUTCFullYear(), //B008.BR02.1: B001
			correcteAanvrager, //B008.BR02.2: B002
			studieVoldoet, //B008.BR02.3: B004
			//B008.BR02.4: Andere regeling wordt niet meegenomen, zie issue #50
			() => compare("B008.BR02.5", (a, b) => a >= b, beschikbareBudgetCenten, maxSubsidieBedragCenten) //B008.BR02.5: B006 & B101
		);

		if (toewijzen.result === false) {
			//De aanvraag is afgewezen om de volgende redenen:
			return `Afgewezen: ${Array.from(new Set(toewijzen.problems)).toString()}`;
		} else if (toewijzen.result === undefined) {
			//De volgende informatie is nog onbekend, dus kan nog niet worden goedgekeurd:
			return `Ontbreekt: ${Array.from(new Set(toewijzen.unknown)).toString()}`;
		} else {
			//De aanvraag is goedgekeurd
			await query("INSERT", "subsidies", "(docent, opleiding, jaar, vervolg_aanvraag, aanvraag_tijd, " +
				"bedrag_centen, sector) VALUES ($1, $2, $3, $4, $5, $6, $7);",
				[from, binaryOpleiding, payload.jaar, vervolgAanvraag, previousBlockTimestamp, maxSubsidieBedragCenten, aanvrager.eigenschappen.sector]);
			await query("UPDATE", "budget", "SET uitgegeven_totaal_centen = uitgegeven_totaal_centen + $3, " +
				"uitgegeven_vervolg_centen = GREATEST(uitgegeven_vervolg_centen + $4, beschikbaar_vervolg_centen) WHERE jaar = $1 AND sector = $2;",
				[payload.jaar, budgetSector, maxSubsidieBedragCenten, vervolgAanvraag ? maxSubsidieBedragCenten : 0]);
			return "OK";
		}
	}
}