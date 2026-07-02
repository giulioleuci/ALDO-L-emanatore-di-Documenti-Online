import type { GeneratorStrategy } from './GeneratorStrategy';
import type { Cdu } from '../context/Cdu';
import type { IDocumentFacade } from '../../infrastructure/facades/DocumentServiceFacade';

export class VerbaleGeneratorStrategy implements GeneratorStrategy {
  constructor(private readonly doc: IDocumentFacade) {}
  render(fileId: string, cdu: Cdu): void {
    this.doc.replaceText(fileId, {
      '{{focus.classe.anagrafica.nome}}': cdu.focus.classe.anagrafica.nome,
      '{{focus.classe.anagrafica.anno}}': String(cdu.focus.classe.anagrafica.anno),
      '{{meta.date.oggi.breve}}': cdu.meta.date.oggi.breve
    });
  }
}
