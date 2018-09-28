import { Contract, InitQuery, CodeQuery, Template, addr, TemplateFieldType } from "../../contract";
import { Subsidie } from "./interfaces";

interface SubsidieAanvraagAnnulerenTemplate {
	opleiding: string;
	jaar: number;
}

export default class SubsidieAanvraagAnnulerenContract extends Contract<SubsidieAanvraagAnnulerenTemplate> {
	public type: string = "SubsidieAanvraagAnnuleren";
	public version: string = "1.1";
	public description: string = "Leraar annuleert subsidie aanvraag.";

	public template: Template<SubsidieAanvraagAnnulerenTemplate> = {
		opleiding: { type: TemplateFieldType.hash, desc: "De opleiding van de aanvraag die wordt geannuleerd.", name: "Opleiding" },
		jaar: { type: TemplateFieldType.uint, desc: "Het jaar van de aanvraag die wordt geannuleerd.", name: "Jaar" }
	};

	public async init(from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: InitQuery): Promise<void> {

	}

	public async code(payload: SubsidieAanvraagAnnulerenTemplate, from: addr, block: number, processor: addr, previousBlockTimestamp: number,
		previousBlockHash: string, query: CodeQuery): Promise<"OK" | string | void> {

		if (payload.jaar > 2147483647) {
			return "Ongeldig jaar.";
		}

		//Alle subsidieaanvragen gesorteerd op jaar
		const subsidieAanvragen: Subsidie[] = (await query("SELECT", "subsidies", "WHERE docent = $1 AND opleiding = $2 AND geannuleerd = false;",
			[from, Buffer.from(payload.opleiding, "hex")])).rows;
		subsidieAanvragen.sort((aanvraagA, aanvraagB) => aanvraagA.jaar - aanvraagB.jaar);

		const aanvraag = subsidieAanvragen.find((eenAanvraag) => eenAanvraag.jaar === payload.jaar);
		if (aanvraag === undefined) {
			return "Subsidie aanvraag bestaat niet.";
		}

		const kanNogAnnulerenTijd = new Date(previousBlockTimestamp);
		//B003.BR05.2: Kan tot 2 maanden na aanvraag annuleren
		kanNogAnnulerenTijd.setUTCMonth(kanNogAnnulerenTijd.getUTCMonth() + 2);
		if (aanvraag.aanvraag_tijd > kanNogAnnulerenTijd.getTime()) {
			return "Subsidie aanvraag kan niet meer worden geannuleerd.";
		}

		if (subsidieAanvragen.some((eenAanvraag) => eenAanvraag.jaar > payload.jaar)) {
			return "Er zijn al vervolg aanvragen voor deze aanvraag, annuleer deze eerst.";
		}

		//Annuleer de aanvraag
		await query("UPDATE", "subsidies", "SET geannuleerd = true WHERE docent = $1 AND " +
			"opleiding = $2 AND jaar = $3;", [aanvraag.docent, aanvraag.opleiding, aanvraag.jaar]);

		//Verhoog beschikbare budget
		let bedragCenten = aanvraag.bedrag_centen;
		if (aanvraag.studieverlof_bedragcenten !== null) {
			bedragCenten += aanvraag.studieverlof_bedragcenten;
		}
		await query("UPDATE", "budget", "SET uitgegeven_totaal_centen = uitgegeven_totaal_centen + $3, " +
			"uitgegeven_vervolg_centen = uitgegeven_vervolg_centen + $4 WHERE jaar = $1 AND sector = $2;",
			[aanvraag.jaar, aanvraag.sector, bedragCenten, aanvraag.vervolg_aanvraag ? bedragCenten : 0]);

		return "OK";
	}
}