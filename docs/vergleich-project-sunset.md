<!-- Quelle: Google Drive, „Systemischer Architektur- und Gameplay-Vergleich“, von André am 13.11.2026 abgelegt, hier unverändert als Markdown-Export. -->

### Systemischer Architektur- und Gameplay-Vergleich: Project Sunset (Claude Fable 5.2) vs. Bornheim (André Hinz)

Im Spannungsfeld moderner Web- und Spieleentwicklung prallen derzeit zwei grundverschiedene Entwicklungsansätze aufeinander: Auf der einen Seite steht das spektakuläre KI-Experiment  **Project Sunset** , bei dem das Sprachmodell Claude Fable 5.2 auf Basis eines 20.542 Wörter starken Megaprompts über 48 Stunden hinweg autonom ein GTA-ähnliches Open-World-Spiel generierte. Auf der anderen Seite steht  **web.bornheim**  von André Hinz, eine hochgradig spezialisierte, auf realen Geodaten und systemischer Simulation basierende WebGL-Sandbox, die den Frankfurter Stadtteil Bornheim als interaktiven sozialen und physischen Mikrokosmos im Browser abbildet.  
Ein detaillierter technischer und gestalterischer Vergleich beider Projekte offenbart faszinierende Divergenzen: Während das KI-Projekt vor allem in der Breite klassischer Genre-Konventionen (Minispiele, kriminelle Missionsketten, Fahrzeugvielfalt, Luftfahrt und Lebenssimulation) glänzt, deklassiert Bornheim das KI-Experiment in Bezug auf topografische Präzision, physikalische Integrität, systemische Emergenz und thematischen Tiefgang.

#### 1\. Systemische Vergleichsmatrix

Die folgende Übersicht fasst die Kernparameter, technischen Eckdaten und implementierten Spielsysteme beider Projekte gegenüberstellend zusammen:  
Dimension / Subsystem,Project Sunset (Claude Fable 5.2 / „GTA 6 Prompt“),web.bornheim (André Hinz)  
Entstehungsmethode,"Autonomer 48-Stunden-KI-Lauf, Megaprompt (20.542 Wörter, 35 Kapitel), 51 Sub-Agenten, 1,54 Mrd. Tokens","Handgefertigte Engine-Architektur, Geodaten-Pipeline und systemische Skripte"  
Kartenbasis & Geometrie,"Synthetisch generierte Zonen (Marina, Strand, Sumpf, Wald, Wohngebiet, Skyline); kein realer Raumbezug","Echtes Frankfurt aus amtlichen Geländedaten (HVBG Hessen, 4 m Höhendaten) und OpenStreetMap (4.000 Gebäude, 840 Straßen)"  
Rendering & Plattform,"Web-Stack, primär als Desktop-Executable (.exe) gebündelt zur Vermeidung von Rucklern","Natives WebGL 2 im Browser, 4 skalierbare Grafikprofile (Niedrig bis Ultra mit 4K-Schatten und 8× MSAA), Mobile-Touch-Steuerung"  
Asset-Größe & Startzeit,"Unbekannte, schwere Datenmenge; lokale Installation empfohlen",Extrem schlanker Initial-Download von ca. 25 MB; sofortige Einsatzbereitschaft im Browser  
Missionsstruktur,"Klassischer Heist-Bogen (Auftraggeber Markus Reed, Observation, Fluchtwagen, Schießerei, Beuteabgabe)","3 verzweigte politische Kampagnen („Bornheim bleibt“, „Freitag ist Pflicht“, „Der Kanzler kommt“) mit jeweils 3 verschiedenen Enden"  
Minispiele & Freizeit,"Vollwertiges Casino (Blackjack, Roulette, Slots), Billard, Darts (501/Checkout), Basketball",Keine Freizeit-Minispiele; Fokus liegt vollständig auf der städtischen Sandbox  
Verkehr & Fortbewegung,"Autos, SUVs, Pickups, Sportwagen, Flugzeuge, Helikopter; Einsteiganimationen, Radio mit Sendern","Autos (Handbremsen-Drift, Schadensmodell), Fahrräder (32 km/h, Klingel, Sturzmechanik), Wasserwerfer; keine Flugzeuge oder Radios"  
Ziviles & Notfall-System,Statische/glitchende Passanten; rudimentärer Rettungsdienst und Taxi-Auftrag per Timer,"Dynamische Demonstrationszüge mit Eskalationsstufen, Polizeikessel, Wasserwerfereinsatz, Müll- und Autobände, anrückende Feuerwehr"  
Lebenssimulation & Rollenspiel,"Apartment mit Bett (Zeitsprung), Kleiderschrank (Garderobenwechsel), In-Game-Smartphone ('H') mit SMS/Cheats",Kleidung statisch; kein Apartment; dafür Social-Media-Feed ('V' zum Filmen/Posten) und interaktiver Kreativmodus ('C')  
Multiplayer,Integrierter Cloudfunnel zur automatischen Erstellung einer temporären Serveradresse (15–30 s),Reines Singleplayer-Erlebnis; lokaler Spielstand mit Datei-Export/Import

#### 2\. Wo Project Sunset die Nase vorn hat: Die Stärken des KI-Experiments

Analysiert man die Features, die im Video von NULLPLAN vorgeführt wurden, stechen mehrere Bereiche hervor, in denen Claude Fable 5.2 klassische Erwartungshaltungen an ein vollwertiges „Grand Theft Auto“ umfassender bedient als die aktuelle Version von web.bornheim.

##### 2.1 Vollwertige Minispiele und Freizeitbeschäftigungen

Die größte funktionale Überraschung in Project Sunset ist die Implementierung vollständig durchdachter, regelbasierter Nebenaktivitäten:

* **Crown Casino mit mehreren Tischspielen** : Spieler können an virtuellen Spielautomaten (Einarmige Banditen) drehen, am Blackjack-Tisch gegen den Dealer antreten (inklusive Kartengeben, Kartenwerten, Treffen, Halten und Auszahlungslogik) oder beim Roulette bis zu 2.500 Dollar auf Rot oder Schwarz setzen.  
* **Sport- und Kneipenspiele** : Im Spiel existiert ein funktionierender Billardtisch mit echter Kugel- und Taschenphysik sowie ein vollwertiges Dartspiel mit Zählsystem (501 Punkte, Checkout-Regeln) gegen einen KI-Gegner namens Henk. Zudem wurden Basketball-Plätze angelegt.

In web.bornheim existieren derartige Nebenbeschäftigungen nicht. Dort ist der gesamte spielerische Fokus auf städtische Dynamiken und Demonstrationen gerichtet, wodurch klassische „Downtime-Aktivitäten“ zur Auflockerung fehlen.

##### 2.2 Klassische GTA-Missionsdramaturgie und filmische Inszenierung

Project Sunset liefert eine typische Rockstar-Missionserfahrung aus einem Guss:

* **Inszenierte Story-Aufträge („The Harbor Job“)** : Die Mission mit dem NPC Markus Reed an Pier 17 führt den Spieler durch eine mehrstufige Heist-Vorbereitung: Dialog mit Verzweigungen in einer Cutscene, Scouting eines Frachtdepots von drei vorgegebenen Beobachtungspunkten aus, Diebstahl und Einparken eines schnellen Fluchtwagens in der Dockside Garage, ein Schusswechsel gegen bewaffnete Wachleute am Frachter, Flucht vor der Polizei und finale Frachtübergabe in Westven für eine Belohnung von 18.000 Dollar.  
* **Atmosphärische Einbettung** : Die Mission folgt der vertrauten Dramaturgie aus Exposition, Vorbereitung, Action-Höhepunkt und Entkommen. Bornheims Stories hingegen sind stark dokumentarisch und soziopolitisch getrieben (Demos, Bürgerdialoge, Streiks), verzichten jedoch auf cinematische Third-Person-Inszenierungen oder klassische Heist-Logistik.

##### 2.3 Luftfahrt und dreidimensionale Mobilität

Project Sunset bricht die Begrenzung auf Straßen auf:

* **Flugplatz und Flugzeuge** : Das Spiel bietet einen funktionsfähigen Flugplatz mit steuerbaren Kleinflugzeugen. Die Flugmechanik beinhaltet eine echte Höhenanzeige, Geschwindigkeiten von über 200 km/h und erlaubt es, die gesamte Skyline und die Außenbezirke aus der Vogelperspektive zu überfliegen. Zudem existieren Helikopter.  
* In web.bornheim beschränkt sich die vertikale Fortbewegung auf Klettern, Parkour über Dächer und den sogenannten Kreativmodus ('C'), der eine schwebende Noclip-Flugkamera freischaltet, jedoch keine physikalisch simulierte Luftfahrtflotte darstellt.

##### 2.4 Lebenssimulation, Garderobe und gezielte Zeitsteuerung

Für die Rollenspiel-Immersion bietet Project Sunset Mechanismen, die dem Spieler das Gefühl eines persönlichen Rückzugsortes vermitteln:

* **Begehbares Apartment** : Der Spieler besitzt eine Wohnung mit Speicherfunktion, Sanitäreinrichtungen und einem interaktiven Kleiderschrank.  
* **Modulares Kleidungssystem** : Der Protagonist kann Jacken, Sakkos, Cargohosen, Stiefel und Caps separat an- und ablegen, wobei sich das 3D-Modell visuell unmittelbar anpasst.  
* **Schlaf- und Zeitsprungmechanik** : Durch Interaktion mit dem Bett kann der Spieler gezielt eine Stundenzahl wählen (beispielsweise 6 Stunden schlafen, um exakt um Mitternacht aufzuwachen), wodurch der dynamische Tag-Nacht-Zyklus nach Wunsch übersprungen wird.  
* **Smartphone-Interface ('H')** : Über ein In-Game-Handy laufen Nachrichten von Kontakten ein, Vermögensstatistiken werden visualisiert, und Cheats (wie „Geldregen 100.000\$“) können per Knopfdruck getriggert werden.

##### 2.5 Fahrzeug-Details und Soundkulisse

Im Bereich der Fahrzeugbedienung besitzt Project Sunset kleine, aber hochwirksame Details:

* **Einsteiganimationen** : Fahrzeuge werden nicht einfach instantan geentert, sondern verfügen über eine sichtbare Türöffnungs- und Einstiegssequenz.  
* **Autoradio** : Beim Fahren steht ein In-Game-Radio zur Verfügung, dessen Sender durchgeschaltet oder stummgeschaltet werden können.  
* **Fahrzeugkauf** : Ein Autohändler-Menü erlaubt das Erwerben verschiedener Modellklassen (Geländewagen, SUV, Pickup, Transporter), sofern ausreichend Barmittel vorhanden sind.

##### 2.6 Klassische Arcade-Nebenjobs

Sunset implementiert die aus GTA 3 bis San Andreas bekannten Standard-Loops:

* **Rettungsdienst** : Übernahme eines Krankenwagens mit striktem 90-Sekunden-Timer, Abholung verletzter Personen und Rücktransport zum Hospital gegen Entlohnung von 394 Dollar.  
* **Taxidienst** : Annahme von Fahraufträgen (wie am Meridian Plaza) mit Routenführung und Fahrpreisabrechnung (172 Dollar).  
* **Straßenrennen** : Abstecken von Rundkursen mit KI-Fahrern, die den Spieler aggressiv rammen und um Positionen kämpfen.

##### 2.7 Integrierte Multiplayer-Architektur

Ein bemerkenswerter technologischer Aspekt von Project Sunset ist die Option, das Spiel direkt für Freunde freizugeben: Über einen internen Prozess startet das Spiel im Hintergrund einen Cloudfunnel-Tunnel (Befehl zur Portweiterleitung), der binnen 15 bis 30 Sekunden eine öffentliche Serveradresse generiert, über die Mitspieler der Session beitreten können.

#### 3\. Wo web.bornheim dem KI-Projekt weit überlegen ist

Trotz der Fülle an oberflächlichen Features leidet Project Sunset unter den typischen Symptomen prompt-basierter Entwicklung: Es wirkt wie eine Ansammlung isolierter Skripte, denen ein kohärentes Fundament fehlt. Genau an dieser Stelle demonstriert web.bornheim die Überlegenheit einer durchdachten, handgefertigten Engine-Architektur.

##### 3.1 Authentische Geodaten vs. Kulissen-Halluzination

* **Geodaten-Twin** : Bornheim nutzt über 4.000 reale Gebäude, 840 Straßen und ein auf 4 Meter genaues digitales Höhenmodell der hessischen Verwaltung für Bodenmanagement und Geoinformation (HVBG) in Kombination mit OpenStreetMap. Topografie, Gefälle, Straßenbreiten, die A661-Brücke, das Altbauviertel mit Dachgauben und echte Parkanlagen (wie der Günthersburgpark) sind reale digitale Zwillinge.  
* **Der KI-Fehler** : Project Sunset halluziniert ein typisches Raster aus Straßenblöcken. Wie im Video sichtbar wird, platziert die KI bizarre Fehler wie zwei Hydranten direkt nebeneinander, unlogische Straßeneinmündungen und generische Zonen, die zwar Marina und Sumpf heißen, aber städtebaulich keinen echten Sinn ergeben.

##### 3.2 Systemische Emergenz: Polizei, Feuerwehr und Brandkaskaden

In Bornheim greifen Spielsysteme physikalisch und logisch ineinander, anstatt nur Trigger abzuarbeiten:

* **Brand- und Löschsimulation** : Brennende Mülltonnen oder Fahrzeuge entzünden benachbarte Autos über Hitzeübertragung. Die städtische Feuerwehr rückt über das reale Straßennetz an, baut Absperrungen auf, beginnt mit Löscharbeiten und zieht sich zurück, falls Einsatzkräfte von Demonstranten angegriffen werden.  
* **Eskalationsdynamik der Polizei** : Die Polizei in Bornheim reagiert abgestuft auf Spieleraktionen und Massenstimmungen: Sie bildet Absperrketten, kesselt Demozüge ein, setzt Pfefferspray frei und fährt schließlich den schweren Wasserwerfer auf.  
* **Interaktives Großgerät** : Der Wasserwerfer in Bornheim ist kein reines KI-Hindernis, sondern kann vom Spieler selbst gekapert und gefahren werden.

In Project Sunset erschöpft sich das Polizeisystem im Wesentlichen darin, dass Streifenwagen den Spieler überfahren, ein Schusswechsel getriggert wird oder man im Krankenhaus mit 325 Dollar Abzug respawnt.

##### 3.3 Kollisionsintegrität und Physikstabilität

Das Video zu Project Sunset deckt massive Mängel in der Engine-Stabilität auf:

* **Kollisionslücken** : Tische im Casino und Darts-Bereich besitzen keinerlei Hitboxen (der Spieler läuft glatt hindurch), ebenso fehlen Kollisionen an Kais und Lagerhallen.  
* **NPC-Glitches** : Passanten sitzen mitten im Asphalt, Beine ragen unter Gehwegen heraus.  
* **Physik-Katastrophen** : Ragdoll-Fehler katapultieren den Spieler unvermittelt kilometerweit durch die Luft.  
* web.bornheim hingegen besitzt saubere Kollisionsabfragen für 4.000 Gebäude, Zäune, Bordsteine und Dächer, bietet funktionierende Fahrrad-Fahrphysik mit realistischen Stürzen (statt explodierenden Fahrzeugen) und eine deterministische Federungs- und Handbremsenmechanik für Autos.

##### 3.4 Narrative Substanz und gesellschaftlicher Realismus

Während Project Sunset die abgenutzte Schablone amerikanischer Gangsterfilme bedient (Heist für den mysteriösen Markus am Pier), beweist Bornheim erzählerischen Mut und thematische Originalität:

1. **Drei vollwertige Verzweigungskampagnen** :  
2. *„Bornheim bleibt“*  thematisiert den realen Hitzesommer, Mietenexplosion und den Kampf gegen Investorentürme im Günthersburgpark (5 Kapitel von Farbbeuteln bis zur Großdemo; Enden: friedlich & laut, Kompromiss oder Krawall).  
3. *„Freitag ist Pflicht“*  behandelt marode Bildungsinfrastruktur bei 34 Grad Raumtemperatur und gesperrten Turnhallen (6 Kapitel, Sternmarsch, brennende Autos; Enden: Sanierung, Sündenbock, Spaltung).  
4. *„Der Kanzler kommt“*  inszeniert den Bürgerdialog im Saalbau mit Sicherheitszone, Kioskschließung und Straßensperren (3 Kapitel, rein deeskalativ und ohne Waffen lösbar).  
5. **Massensteuerung via 'G'** : Spieler können Bürger aktiv mobilisieren, Sprechchöre anstimmen oder die Menge beruhigen, um Polizeigewalt abzuwenden.

##### 3.5 WebGL-Performance, Asset-Ökonomie und Plattformvielfalt

* **Extremer Leichtbau** : Bornheim lädt die gesamte Spielwelt bei einem Initial-Volumen von lediglich  **ca. 25 MB**  in wenigen Sekunden direkt in den Browser. Es bietet vier dedizierte Grafikprofile (vom älteren Office-Laptop mit Intel-Grafik bis zum High-End-PC mit 4K-Schatten und 8× MSAA) und unterstützt mobile Endgeräte über virtuelle On-Screen-Joysticks.  
* **Der Ressourcenhunger von Sunset** : Die KI-Engine lief im Browser so ruckelig und instabil, dass der YouTuber eine lokale Desktop-Anwendung (.exe) bündeln musste. Beim Generieren fielen 3.540 Anfragen, 1,54 Milliarden Tokens und rechnerische API-Kosten von rund 950 Dollar an.

#### 4\. Architektonische Handlungsempfehlungen für web.bornheim

Um den Abstand zu den Stärken von Project Sunset zu schließen, ohne die eigene systemische Integrität und die realweltliche Identität Frankfurts aufzugeben, bieten sich gezielte funktionale Erweiterungen an. Die folgende Matrix skizziert konkrete Ausbaustufen, geordnet nach Mehrwert und Umsetzungsaufwand:  
Entwicklungsbereich,Konkretes Feature-Konzept für Bornheim,Analytischer Mehrwert  
1\. Audio & Akustik,"In-Game-Radio mit lokalem Bürgerfunk, Indie-Tracks und dynamischen Demo-Sondersendungen","Erhöht die Atmosphäre beim Autofahren analog zu Sunset, transportiert jedoch lokale Narrative."  
2\. Lokalkolorit-Minispiele,"Tischtennisplatten im Günthersburgpark, Tischkicker im Jugendzentrum, Rubbellose am Kiosk","Liefert spielerische Auflockerung („Downtime“), ohne auf generische Casino-Klischees zurückgreifen zu müssen."  
3\. Zivile Nebenjobs,"Kurierfahrten per Lastenrad, Müllabfuhr-Einsätze oder Schichten auf dem Notarztwagen","Nutzt vorhandene Verkehrs- und Fahrradmechaniken für sinnstiftende, realistische Arcade-Loops."  
4\. Begehbare Hubs & Garderobe,Yusufs Kiosk oder Saalbau-Foyer als Safehouse mit Zeitraffer-Schlaffunktion und Outfit-Wechsel,Verleiht dem Charakter physische Verortung; erlaubt Wechsel zwischen Demokleidung und bürgerlichem Look.  
5\. WebRTC-Multiplayer,Peer-to-Peer-Mesh-Netzwerk im Browser für gemeinsame Straßenproteste,"Ermöglicht gemeinsames Spielen ohne zentrale Serverkosten, adaptiert den Cloudfunnel-Gedanken web-nativ."

##### Detaillierte Ausgestaltung der Kernempfehlungen

1. **Städtisches Radio- und Soundsystem** : Implementierung eines einfachen Audio-Streamers in Fahrzeugen, der lokale Indie-Tracks, Bürgerfunk oder fiktive Nachrichtensendungen passend zum aktuellen Demonstrationsgeschehen abspielt.  
2. **Lokalkolorit-Minispiele** : Statt eines anonymen Las-Vegas-Casinos passen zu Bornheim vollwertige Tischtennis-Matches im Günthersburgpark, Tischkicker im Jugendzentrum oder Kiosk-Rubbellose bei Yusuf.  
3. **Zivile Nebenjobs statt Gangster-Heists** : Nutzung der vorhandenen Fahrradmechanik für Fahrradkurier-Aufträge (z. B. Flyer oder Einkäufe austragen) oder Einsätze im Rettungsdienst über das bestehende Straßennetz.  
4. **Begehbare Schlüsselorte & Garderobe** : Einbindung eines betretbaren Apartments oder Yusufs Kiosk als sozialer Hub, an dem Kleidung gewechselt (z. B. Demo-Hoodie vs. bürgerliche Kleidung) und die Uhrzeit vorgestellt werden kann.  
5. **WebRTC-Multiplayer** : Nutzung von WebRTC für Peer-to-Peer-Verbindungen im Browser, damit mehrere Spieler gemeinsam im selben Straßenabschnitt demonstrieren oder Kessel durchbrechen können.

