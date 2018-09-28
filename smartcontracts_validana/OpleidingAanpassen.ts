import { Contract, InitQuery, CodeQuery, TemplateFieldType, Template, addr } from "../../contract";
import { OpleidingEigenschappen, Opleiding, Entiteit } from "./interfaces";

interface OpleidingTemplate {
	opleiding: string;
	eigenschappen: string;
}

export default class OpleidingContract extends Contract<OpleidingTemplate> {
	public type: string = "OpleidingAanpassen";
	public version: string = "1.1";
	public description: string = "Opleider past de eigenschappen van een opleiding aan.";

	public template: Template<OpleidingTemplate> = {
		opleiding: { type: TemplateFieldType.hash, desc: "De opleiding om aan te passen.", name: "Opleiding" },
		eigenschappen: { type: TemplateFieldType.json, desc: "Aanpassingen.", name: "Aanpassingen" }
	};

	public async init(from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: InitQuery): Promise<void> {

	}

	public async code(payload: OpleidingTemplate, from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: CodeQuery): Promise<"OK" | string | void> {

		//Huidige eigenschappen
		const binaryOpleiding = Buffer.from(payload.opleiding, "hex");
		const opleiding: Opleiding | undefined = (await query("SELECT", "opleidingen", "WHERE id = $1;", [binaryOpleiding])).rows[0];
		if (opleiding === undefined) {
			return "Opleiding bestaat niet.";
		}

		//Alleen opleider mag docenten aanpassen op sommige velden
		const opleiderCheck = () => {
			return opleiding.opleider === from;
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
		const newSettings: OpleidingEigenschappen = JSON.parse(payload.eigenschappen);
		if (typeof newSettings !== "object" || newSettings === null) {
			return "Ongeldige eigenschappen";
		}

		//Kijk of aangepaste eigenschappen door de juiste gebruiker worden aangepast en geldig zijn
		for (const key of Object.keys(newSettings) as Array<keyof OpleidingEigenschappen>) {
			switch (key) {
				//UC1.R4
				case "bachelor": //B004.BR02.1 & B402.BR02.2
				case "master": //B004.BR02.2 & B402.BR02.2
				case "deficiëntieopleiding": //B004.BR02.3 & B402.BR02.2
					if (typeof newSettings[key] !== "boolean" || !opleiderCheck() || opleiding.eigenschappen.aanpassenStap === 2) {
						return "Ongeldige eigenschappen of gebruiker of mag niet meer aanpassen";
					} else {
						opleiding.eigenschappen.aanpassenStap = 1;
					}
					break;
				case "EC": //B003.BR02 & B003.BR07
				//UC2.R1 & UC3.R3
				case "collegeGeldCenten": //B006.BR02.1 & B401.BR02.2
					if (typeof newSettings[key] !== "number" || newSettings[key]! > 2147483647 || !opleiderCheck()) {
						return "Ongeldige eigenschappen of gebruiker";
					} else {
						opleiding.eigenschappen.aanpassenStap = 1;
					}
					break;
				//UC1.R5
				case "inNederland": //B004.BR03.1
				case "inEU": //B004.BR03.2
				case "inAruba": //B004.BR03.3
				case "inSintMaarten": //B004.BR03.4
				case "inCuraçao": //B004.BR03.5
				case "inEngland": //Brexit update, mag nu alvast gaan instellen
				case "NufficGelijkwaardigVerklaardeBuitenlands": //B004.BR04.1
				case "NVOgeaccrediteerd": //B004.BR04.2
					if (typeof newSettings[key] !== "boolean" || !await duoCheck() || opleiding.eigenschappen.aanpassenStap === undefined) {
						return "Ongeldige eigenschappen of gebruiker of mag nog niet aanpassen";
					} else {
						opleiding.eigenschappen.aanpassenStap = 2;
					}
					break;
				default:
					return "Ongeldige eigenschap";
			}
		}

		//Eigenschappen updaten
		Object.assign(opleiding.eigenschappen, newSettings);
		await query("UPDATE", "opleidingen", "SET eigenschappen = $2 WHERE id = $1;",
			[binaryOpleiding, JSON.stringify(opleiding.eigenschappen)]);

		return "OK";
	}
}