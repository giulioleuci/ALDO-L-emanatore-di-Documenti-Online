# Push GitHub: ALDO e GasLibraryFactory

Eseguire da terminale nella root del workspace.

## 1. Autenticazione GitHub

```bash
gh auth login -h github.com
gh auth status
```

`gh auth status` deve confermare accesso valido a `github.com`.

## 2. Push ALDO

```bash
cd "/home/giulio/Desktop/ALDO implementing"
git status -sb
git push origin master
```

## 3. Push GasLibraryFactory

```bash
cd "/home/giulio/Desktop/ALDO implementing/GasLibraryFactory"
git status -sb
git push origin main
```

## 4. Verifica remota

```bash
cd "/home/giulio/Desktop/ALDO implementing"
git status -sb

cd "/home/giulio/Desktop/ALDO implementing/GasLibraryFactory"
git status -sb
```

Entrambi gli output devono indicare branch allineato a `origin` e working tree pulito.
