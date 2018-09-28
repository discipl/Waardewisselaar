import { Contract, InitQuery, CodeQuery, TemplateFieldType, Template, addr } from "../../contract";
import { DocentEigenschappen, Docent, Entiteit, WerkSector } from "./interfaces";

interface DocentTemplate {
	docent: addr;
	eigenschappen: string;
}

export default class DocentContract extends Contract<DocentTemplate> {
	public type: string = "DocentAanpassen";
	public version: string = "1.1";
	public description: string = "School/Duo past de eigenschappen van een docent aan.";

	public template: Template<DocentTemplate> = {
		docent: { type: TemplateFieldType.addr, desc: "De docent om aan te passen.", name: "Docent" },
		eigenschappen: { type: TemplateFieldType.json, desc: "Aanpassingen.", name: "Aanpassingen" }
	};

	public async init(from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: InitQuery): Promise<void> {

	}

	public async code(payload: DocentTemplate, from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: CodeQuery): Promise<"OK" | string | void> {

		//Huidige eigenschappen
		const docent: Docent | undefined = (await query("SELECT", "docenten", "WHERE id = $1;", [payload.docent])).rows[0];
		if (docent === undefined) {
			return "Docent bestaat niet.";
		}

		//Alleen werkgever mag docenten aanpassen op sommige velden
		const werkgeverCheck = () => {
			return docent.werkgever === from;
		};

		//Alleen duo mag docenten aanpassen op sommige velden
		let isDuo: boolean | undefined;
		const duoCheck = async () => {
			if (isDuo === undefined) {
				const duo: Entiteit | undefined = (await query("SELECT", "entiteiten", "WHERE id = 'DUO';", [])).rows[0];
				isDuo = duo !== undefined && duo.address === from;
			}
			return isDuo;
		};

		//Nieuwe eigenschappen
		const newSettings: DocentEigenschappen = JSON.parse(payload.eigenschappen);
		if (typeof newSettings !== "object" || newSettings === null) {
			return "Ongeldige eigenschappen";
		}

		//Kijk of aangepaste eigenschappen door de juiste gebruiker worden aangepast en geldig zijn
		for (const key of Object.keys(newSettings) as Array<keyof DocentEigenschappen>) {
			switch (key) {
				//UC1.R2
				case "voldoetAanBevoegdheidseisen": //B002.BR01.1
				case "twintigProcentLesgebondenTaken": //B002.BR06.1
				case "pedagogischDidactischVerantwoordelijk": //B002.BR06.2
				case "ambulantBegeleider": //B002.BR07.1
				case "zorgcoördinator": //B002.BR07.2
				case "interneBegeleider": //B002.BR07.3
				case "remedialTeacher": //B002.BR07.4
					if (typeof newSettings[key] !== "boolean" || !werkgeverCheck()) {
						return "Ongeldige eigenschappen of gebruiker";
					}
					break;
				//UC1.R3
				case "graadBachalorVoeren": //B002.BR08.2
					if (typeof newSettings.graadBachalorVoeren !== "boolean" || !await duoCheck()) {
						return "Ongeldige eigenschappen";
					}
					break;
				//UC2.R3
				case "sector": //B402.BR02.1 & B403.BR02.1-7
					const sector: WerkSector = newSettings.sector as WerkSector;
					if (sector !== "PO" && sector !== "PSO" && sector !== "HBO" && sector !== "BVE"
						&& sector !== "VO" && sector !== "VSO" || !await werkgeverCheck()) {
						return "Ongeldige eigenschappen";
					}
					break;
				//UC4.R1
				case "fte": //B402.BR01.2
					if (typeof newSettings[key] !== "number" || !await werkgeverCheck()) {
						return "Ongeldige eigenschappen";
					}
					break;
				default:
					return "Ongeldige eigenschappen";
			}
		}

		//Eigenschappen updaten
		Object.assign(docent.eigenschappen, newSettings);
		await query("UPDATE", "docenten", "SET eigenschappen = $2 WHERE id = $1;",
			[payload.docent, JSON.stringify(docent.eigenschappen)]);

		return "OK";
	}
}