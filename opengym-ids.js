'use strict';
// openGym's exercise numbers, so a workout logged in openGym arrives here with its name and the muscles it trains.
// One line per exercise: number|name|muscles|kind. Muscles are two-letter codes (OG_MUS) with 2 for the muscle the
// exercise is for and 1 for one it trains on the way, the same full and half credit Health gives its own exercises.
// Kind: c cardio, h a hold, m stretching or mobility (no lifting credit).
//
// Generated from openGym's catalogue (github.com/DuarteSantos8/openGym, catalogue/exercises), using only the
// 1324 entries whose names and muscles come from ExerciseDB v1 by AscendAPI via hasaneyldrm/exercises-dataset:
//
//   MIT License. Copyright (c) 2026 Hasan Emir Yıldırım
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
//   documentation files (the "Software"), to deal in the Software without restriction, including without limitation
//   the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
//   permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright
//   notice and this permission notice shall be included in all copies or substantial portions of the Software.
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
//   WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS
//   OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
//   OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
// No openGym descriptions, instructions, pictures or animations are copied: those stay in openGym.
const OG_MUS = { ch: 'chest', fd: 'frontDelts', sd: 'sideDelts', rd: 'rearDelts', bi: 'biceps', tr: 'triceps', fa: 'forearms', ab: 'abs', ob: 'obliques', la: 'lats', ub: 'upperBack', tp: 'traps', lb: 'erectors', gl: 'glutes', hm: 'hamstrings', qd: 'quads', ad: 'adductors', ca: 'calves' };
const OG_LIST = `
0001|3/4 sit-up|ab2lb1|
0002|45° side bend|ob2ab1|
0003|air bike|ab2|
0006|alternate heel touchers|ab2ob1|
0007|alternate lateral pulldown|la2bi1ub1|
0009|assisted chest dip (kneeling)|ch2tr1fd1|
0010|assisted hanging knee raise with throw down|ab2lb1|
0011|assisted hanging knee raise|ab2|
0012|assisted lying leg raise with lateral throw down|ab2ob1|
0013|assisted lying leg raise with throw down|ab2qd1|
0014|assisted motion russian twist|ob2ab1lb1|
0015|assisted parallel close grip pull-up|la2bi1fa1|
0016|assisted prone hamstring|hm2gl1lb1|
0017|assisted pull-up|la2bi1fa1|
0018|assisted standing triceps extension (with towel)|tr2fd1|
0019|assisted triceps dip (kneeling)|tr2ch1fd1|
0020|balance board||m
0022|barbell pullover to press|la2tr1ch1fd1|
0023|barbell alternate biceps curl|bi2fa1|
0024|barbell bench front squat|qd2hm1gl1ca1|
0025|barbell bench press|ch2tr1fd1|
0026|barbell bench squat|qd2gl1hm1ca1|
0027|barbell bent over row|ub2bi1fa1|
0028|barbell clean and press|qd2hm1gl1fd1tr1|
0029|barbell clean-grip front squat|qd2gl1hm1ca1ab1|
0030|barbell close-grip bench press|tr2ch1fd1|
0031|barbell curl|bi2fa1|
0032|barbell deadlift|gl2hm1lb1|
0033|barbell decline bench press|ch2tr1fd1|
0034|barbell decline bent arm pullover|la2tr1ch1|
0035|barbell decline close grip to skull press|tr2ch1fd1|
0036|barbell decline wide-grip press|ch2tr1fd1|
0037|barbell decline wide-grip pullover|la2tr1ch1|
0038|barbell drag curl|bi2fa1|
0039|barbell front chest squat|qd2gl1hm1ca1ab1|
0040|barbell front raise and pullover|ch2fd1tr1|
0041|barbell front raise|fd2bi1tr1|
0042|barbell front squat|qd2gl1hm1ca1ab1|
0043|barbell full squat|qd2gl1hm1ca1ab1|
0044|barbell good morning|hm2lb1|
0045|barbell guillotine bench press|ch2fd1tr1|
0046|barbell hack squat|qd2gl1hm1ca1|
0047|barbell incline bench press|ch2fd1tr1|
0048|barbell incline reverse-grip press|tr2ch1fd1|
0049|barbell incline row|ub2bi1fa1|
0050|barbell incline shoulder raise|fd1tp1|
0051|barbell jefferson squat|qd2gl1hm1ca1|
0052|barbell jm bench press|tr2ch1fd1|
0053|barbell jump squat|qd2gl1hm1ca1|
0054|barbell lunge|gl2qd1hm1ca1|
0055|barbell lying close-grip press|tr2ch1fd1|
0056|barbell lying close-grip triceps extension|tr2fd1|
0057|barbell lying extension|tr2fd1|
0058|barbell lying lifting (on hip)|gl2hm1qd1|
0059|barbell lying preacher curl|bi2fa1|
0060|barbell lying triceps extension skull crusher|tr2fd1|
0061|barbell lying triceps extension|tr2fd1|
0063|barbell narrow stance squat|qd2gl1hm1ca1|
0064|barbell one arm bent over row|ub2bi1fa1|
0065|barbell one arm floor press|tr2ch1fd1|
0066|barbell one arm side deadlift|gl2hm1qd1lb1|
0067|barbell one arm snatch|fd2tp1fa1ab1|
0068|barbell one leg squat|qd2gl1hm1ca1|
0069|barbell overhead squat|qd2gl1hm1ca1ab1|
0070|barbell preacher curl|bi2fa1|
0071|barbell press sit-up|ab2fd1ch1|
0072|barbell prone incline curl|bi2fa1|
0073|barbell pullover|la2ch1tr1|
0074|barbell rack pull|gl2hm1lb1|
0075|barbell rear delt raise|rd2tp1ub1|
0076|barbell rear delt row|rd2tp1ub1bi1|
0077|barbell rear lunge v. 2|gl2qd1hm1ca1|
0078|barbell rear lunge|gl2qd1hm1ca1|
0079|barbell revers wrist curl v. 2|fa2bi1|
0080|barbell reverse curl|bi2fa1|
0081|barbell reverse preacher curl|bi2fa1|
0082|barbell reverse wrist curl|fa2bi1|
0083|barbell rollerout from bench|ab2fd1tr1|
0084|barbell rollerout|ab2lb1|
0085|barbell romanian deadlift|hm2gl1lb1|
0086|barbell seated behind head military press|fd2tr1ub1|
0087|barbell seated bradford rocky press|fd2tr1ub1|
0088|barbell seated calf raise|ca2hm1qd1|
0089|barbell seated close-grip concentration curl|bi2fa1|
0090|barbell seated good morning|hm2gl1lb1|
0091|barbell seated overhead press|fd2tr1ub1|
0092|barbell seated overhead triceps extension|tr2fd1|
0094|barbell seated twist|ob2ab1lb1|
0095|barbell shrug|tp2fd1|
0096|barbell side bent v. 2|ob2ab1lb1|
0097|barbell side split squat v. 2|qd2gl1hm1ca1|
0098|barbell side split squat|qd2gl1hm1ca1|
0099|barbell single leg split squat|qd2gl1hm1ca1|
0100|barbell skier|fd2tr1ab1|
0101|barbell speed squat|qd2gl1hm1ca1|
0102|barbell squat (on knees)|qd2gl1hm1ca1|
0103|barbell standing ab rollerout|ab2fd1lb1|
0104|barbell standing back wrist curl|fa2bi1fd1|
0105|barbell standing bradford press|fd2tr1ub1|
0106|barbell standing close grip curl|bi2fa1|
0107|barbell standing front raise over head|fd2tr1ub1|
0108|barbell standing leg calf raise|ca2hm1gl1|
0109|barbell standing overhead triceps extension|tr2fd1|
0110|barbell standing reverse grip curl|bi2fa1|
0111|barbell standing rocking leg calf raise|ca2hm1qd1|
0112|barbell standing twist|ob2ab1lb1|
0113|barbell standing wide-grip curl|bi2fa1fd1|
0114|barbell step-up|gl2qd1hm1ca1|
0115|barbell stiff leg good morning|hm2gl1lb1|
0116|barbell straight leg deadlift|hm2gl1lb1|
0117|barbell sumo deadlift|gl2hm1qd1lb1|
0118|barbell reverse grip bent over row|ub2bi1fa1|
0119|barbell upright row v. 2|sd2tp1bi1|
0120|barbell upright row|sd2tp1bi1|
0121|barbell upright row v. 3|sd2tp1bi1|
0122|barbell wide bench press|ch2fd1tr1|
0123|barbell wide-grip upright row|sd2tp1bi1|
0124|barbell wide squat|qd2gl1hm1ca1|
0125|barbell wrist curl v. 2|fa2bi1|
0126|barbell wrist curl|fa2bi1|
0127|barbell zercher squat|qd2gl1hm1ca1ab1|
0128|battling ropes|fd2fa1ab1|c
0129|bench dip (knees bent)|tr2ch1fd1|
0130|bench hip extension|gl2hm1|
0137|body-up|tr2ch1fd1|
0138|bottoms-up|ab2ob1|
0139|biceps narrow pull-ups|bi2fa1fd1|
0140|biceps pull-up|bi2fa1fd1|
0148|cable alternate shoulder press|fd2tr1ub1|
0149|cable alternate triceps extension|tr2fd1|
0150|cable bar lateral pulldown|la2bi1ub1rd1|
0151|cable bench press|ch2tr1fd1|
0152|cable concentration extension (on knee)|tr2fa1|
0153|cable cross-over lateral pulldown|la2bi1ub1rd1|
0154|cable cross-over revers fly|fd2ub1tp1|
0155|cable cross-over variation|ch2fd1tr1|
0157|cable deadlift|gl2hm1qd1lb1|
0158|cable decline fly|ch2fd1tr1|
0159|cable decline seated wide-grip row|ub2bi1fa1|
0160|cable floor seated wide-grip row|ub2bi1fa1|
0161|cable forward raise|fd2tr1fa1|
0162|cable front raise|fd2tr1fa1|
0164|cable front shoulder raise|fd2tp1bi1|
0165|cable hammer curl (with rope)|bi2fa1|
0167|cable high row (kneeling)|la2ub1bi1fd1|
0168|cable hip adduction|ad2gl1qd1|
0169|cable incline bench press|ch2fd1tr1|
0170|cable incline fly (on stability ball)|ch2fd1tr1|
0171|cable incline fly|ch2fd1tr1|
0172|cable incline pushdown|la2tr1fd1|
0173|cable incline triceps extension|tr2fd1|
0174|cable judo flip|ab2ob1fd1|
0175|cable kneeling crunch|ab2ob1|
0176|cable kneeling triceps extension|tr2fd1|
0177|cable lateral pulldown (with rope attachment)|la2bi1fa1|
0178|cable lateral raise|sd2tp1tr1|
0179|cable low fly|ch2fd1tr1|
0180|cable low seated row|ub2bi1fa1|
0182|cable lying close-grip curl|bi2fa1|
0184|cable lying extension pullover (with rope attachment)|la2tr1fd1|
0185|cable lying fly|ch2fd1tr1|
0186|cable lying triceps extension v. 2|tr2fd1|
0188|cable middle fly|ch2fd1tr1|
0189|cable one arm bent over row|ub2bi1fa1|
0190|cable one arm curl|bi2fa1|
0191|cable one arm lateral bent-over|sd2ch1tp1|
0192|cable one arm lateral raise|sd2tp1tr1|
0193|cable one arm straight back high row (kneeling)|la2ub1bi1fd1|
0194|cable overhead triceps extension (rope attachment)|tr2fd1|
0195|cable preacher curl|bi2fa1|
0196|cable pull through (with rope)|gl2hm1lb1|
0197|cable pulldown (pro lat bar)|la2bi1fa1|
0198|cable pulldown|la2bi1fa1|
0199|cable pushdown (straight arm) v. 2|la2tr1fd1|
0200|cable pushdown (with rope attachment)|tr2fa1|
0201|cable pushdown|tr2fa1|
0202|cable rear delt row (stirrups)|rd2tp1ub1bi1|
0203|cable rear delt row (with rope)|rd2tp1ub1bi1|
0204|cable rear drive|tr2rd1ub1|
0205|cable rear pulldown|la2bi1ub1rd1|
0206|cable reverse curl|bi2fa1|
0207|cable reverse-grip pushdown|tr2fa1|
0208|cable reverse-grip straight back seated high row|la2ub1bi1fa1|
0209|cable reverse preacher curl|bi2fa1|
0210|cable reverse wrist curl|fa2|
0211|cable russian twists (on stability ball)|ob2ab1lb1|
0212|cable seated crunch|ab2ob1|
0213|cable seated high row (v-bar)|la2bi1ub1rd1|
0214|cable seated one arm alternate row|ub2bi1fa1|
0215|cable seated rear lateral raise|rd2tp1ub1|
0216|cable seated shoulder internal rotation|fd2tr1|
0218|cable seated wide-grip row|ub2bi1fa1|
0219|cable shoulder press|fd2tr1ub1|
0220|cable shrug|tp2fd1|
0221|cable side bend crunch (bosu ball)|ob2ab1|
0222|cable side bend|ob2ab1|
0223|cable side crunch|ob2ab1|
0224|cable standing back wrist curl|fa2bi1|
0225|cable standing cross-over high reverse fly|rd2tp1ub1|
0226|cable standing crunch|ab2ob1|
0227|cable standing fly|ch2fd1tr1|
0228|cable standing hip extension|gl2hm1qd1|
0229|cable standing inner curl|bi2fa1|
0230|cable standing lift|ab2ob1lb1|
0231|cable standing one arm triceps extension|tr2fd1|
0232|cable standing pulldown (with rope)|bi2fa1fd1|
0233|cable standing rear delt row (with rope)|rd2tp1ub1bi1|
0234|cable standing row (v-bar)|ub2bi1fd1|
0235|cable standing shoulder external rotation|fd2tp1|
0236|cable standing twist row (v-bar)|ub2bi1fd1|
0237|cable straight arm pulldown (with rope)|la2bi1fa1|
0238|cable straight arm pulldown|la2fd1bi1|
0239|cable straight back seated row|ub2bi1fa1fd1|
0240|cable supine reverse fly|rd2tp1ub1|
0241|cable triceps pushdown (v-bar)|tr2fa1|
0242|cable tuck reverse crunch|ab2|
0243|cable twist|ob2ab1|
0244|cable twisting pull|la2fd1bi1|
0245|cable underhand pulldown|la2bi1fa1|
0246|cable upright row|sd2tp1bi1|
0247|cable wrist curl|fa2bi1|
0248|cambered bar lying row|ub2bi1fa1|
0251|chest dip|ch2tr1fd1|
0253|chin-ups (narrow parallel grip)|la2ub1bi1fa1|
0257|circles knee stretch||m
0258|clock push-up|ch2tr1fd1ab1|
0259|close-grip push-up|tr2ch1fd1|
0260|cocoons|ab2lb1|
0262|cross body crunch|ab2ob1|
0267|crunch (hands overhead)|ab2|
0271|crunch (on stability ball)|ab2|
0272|crunch (on stability ball, arms straight)|ab2|
0274|crunch floor|ab2|
0276|dead bug|ab2lb1|
0277|decline crunch|ab2|
0279|decline push-up|ch2tr1fd1|
0282|decline sit-up|ab2lb1|
0283|diamond push-up|tr2ch1fd1|
0284|donkey calf raise|ca2hm1gl1|
0285|dumbbell alternate biceps curl|bi2fa1|
0286|dumbbell alternate side press|fd2tr1ab1|
0287|dumbbell arnold press v. 2|fd2tr1ch1|
0288|dumbbell around pullover|ch2tr1la1|
0289|dumbbell bench press|ch2tr1fd1|
0290|dumbbell bench seated press|fd2tr1ch1|
0291|dumbbell bench squat|qd2gl1hm1ca1|
0292|dumbbell one arm bent-over row|ub2bi1fa1|
0293|dumbbell bent over row|ub2bi1fa1|
0294|dumbbell biceps curl|bi2fa1|
0295|dumbbell clean|gl2hm1qd1ca1|
0296|dumbbell close-grip press|tr2ch1fd1|
0297|dumbbell concentration curl|bi2fa1|
0298|dumbbell cross body hammer curl|bi2fa1|
0299|dumbbell cuban press|fd2tr1ub1|
0300|dumbbell deadlift|gl2hm1lb1|
0301|dumbbell decline bench press|ch2tr1fd1|
0302|dumbbell decline fly|ch2fd1|
0303|dumbbell decline hammer press|ch2tr1fd1|
0304|dumbbell decline shrug v. 2|tp2fd1ub1|
0305|dumbbell decline shrug|tp2fd1ub1|
0306|dumbbell decline triceps extension|tr2fd1|
0307|dumbbell decline twist fly|ch2fd1tr1|
0308|dumbbell fly|ch2fd1|
0309|dumbbell front raise v. 2|fd2tp1bi1|
0310|dumbbell front raise|fd2bi1tp1|
0311|dumbbell full can lateral raise|sd2tp1|
0312|dumbbell hammer curl v. 2|bi2fa1|
0313|dumbbell hammer curl|bi2fa1|
0314|dumbbell incline bench press|ch2fd1tr1|
0315|dumbbell incline biceps curl|bi2fa1|
0316|dumbbell incline breeding|ch2fd1tr1|
0317|dumbbell incline curl v. 2|bi2fa1|
0318|dumbbell incline curl|bi2fa1|
0319|dumbbell incline fly|ch2fd1|
0320|dumbbell incline hammer curl|bi2fa1|
0321|dumbbell incline hammer press|ch2fd1tr1|
0322|dumbbell incline inner biceps curl|bi2fa1|
0323|dumbbell incline one arm lateral raise|sd2tp1tr1|
0324|dumbbell incline palm-in press|ch2fd1tr1|
0325|dumbbell incline raise|fd2tp1tr1|
0326|dumbbell incline rear lateral raise|rd2tp1ub1|
0327|dumbbell incline row|ub2bi1fd1|
0328|dumbbell incline shoulder raise|fd1tp1|
0329|dumbbell incline shrug|tp2fd1|
0330|dumbbell incline triceps extension|tr2fd1|
0331|dumbbell incline twisted flyes|ch2fd1tr1|
0332|dumbbell iron cross|fd2tr1ch1|
0333|dumbbell kickback|tr2fd1|
0334|dumbbell lateral raise|sd2tp1|
0335|dumbbell lateral to front raise|sd2tp1bi1|
0336|dumbbell lunge|gl2qd1hm1ca1|
0337|dumbbell lying extension (across face)|tr2fd1|
0338|dumbbell lying elbow press|tr2ch1fd1|
0339|dumbbell lying femoral|hm2gl1|
0340|dumbbell lying hammer press|ch2tr1fd1|
0341|dumbbell lying one arm deltoid rear|rd2tp1ub1|
0342|dumbbell lying one arm press v. 2|ch2tr1fd1|
0343|dumbbell lying one arm press|ch2tr1fd1|
0344|dumbbell lying one arm pronated triceps extension|tr2fd1|
0345|dumbbell lying one arm rear lateral raise|rd2tp1ub1|
0346|dumbbell lying one arm supinated triceps extension|tr2fa1|
0347|dumbbell lying pronation|fa2bi1fd1|
0348|dumbbell lying rear lateral raise|rd2tp1ub1|
0349|dumbbell lying supination|fa2bi1fd1|
0350|dumbbell lying supine curl|bi2fa1|
0351|dumbbell lying triceps extension|tr2fd1|
0352|dumbbell neutral grip bench press|ch2tr1fd1|
0353|dumbbell one arm concentration curl (on stability ball)|bi2fa1|
0354|dumbbell one arm kickback|tr2fd1|
0355|dumbbell one arm lateral raise|sd2tp1tr1|
0356|dumbbell one arm lateral raise with support|sd2tp1|
0358|dumbbell one arm reverse wrist curl|fa2|
0359|dumbbell one arm reverse fly (with support)|rd2tp1ub1|
0360|dumbbell one arm shoulder press v. 2|fd2tr1ub1|
0361|dumbbell one arm shoulder press|fd2tr1ub1|
0362|dumbbell one arm triceps extension (on bench)|tr2fd1|
0363|dumbbell one arm upright row|sd2tp1bi1|
0364|dumbbell one arm wrist curl|fa2bi1|
0365|dumbbell over bench neutral wrist curl|fa2bi1|
0366|dumbbell over bench one arm neutral wrist curl|fa2bi1|
0367|dumbbell over bench one arm wrist curl|fa2bi1fd1|
0368|dumbbell over bench revers wrist curl|fa2bi1|
0369|dumbbell over bench wrist curl|fa2bi1|
0370|dumbbell peacher hammer curl|bi2fa1|
0371|dumbbell plyo squat|qd2gl1hm1ca1|
0372|dumbbell preacher curl|bi2fa1|
0373|dumbbell pronate-grip triceps extension|tr2fa1|
0374|dumbbell prone incline curl|bi2fa1|
0375|dumbbell pullover|ch2la1tr1|
0376|dumbbell raise|fd2tp1ub1|
0377|dumbbell rear delt row_shoulder|rd2tp1ub1|
0378|dumbbell rear fly|rd2tp1ub1|
0379|dumbbell rear lateral raise (support head)|rd2tp1ub1|
0380|dumbbell rear lateral raise|rd2tp1ub1|
0381|dumbbell rear lunge|gl2qd1hm1ca1|
0382|dumbbell revers grip biceps curl|bi2fa1|
0383|dumbbell reverse fly|rd2tp1ub1|
0384|dumbbell reverse preacher curl|bi2fa1|
0385|dumbbell reverse wrist curl|fa2bi1|
0386|dumbbell rotation reverse fly|rd2tp1ub1|
0387|dumbbell seated alternate front raise|fd2tp1bi1|
0388|dumbbell seated alternate press|fd2tr1ch1|
0389|dumbbell seated bench extension|tr2fd1|
0390|dumbbell seated biceps curl (on stability ball)|bi2fa1|
0391|dumbbell seated curl|bi2fa1|
0392|dumbbell seated front raise|fd2tp1bi1|
0393|dumbbell seated inner biceps curl|bi2fa1|
0394|dumbbell seated kickback|tr2fd1|
0395|dumbbell seated lateral raise v. 2|sd2tp1tr1|
0396|dumbbell seated lateral raise|sd2tp1ub1|
0397|dumbbell seated neutral wrist curl|fa2bi1|
0398|dumbbell seated one arm kickback|tr2fd1|
0399|dumbbell seated one arm rotate|fa2fd1bi1|
0400|dumbbell seated one leg calf raise|ca2hm1gl1|
0401|dumbbell seated palms up wrist curl|fa2bi1fd1|
0402|dumbbell seated preacher curl|bi2fa1|
0403|dumbbell seated revers grip concentration curl|bi2fa1|
0404|dumbbell seated shoulder press (parallel grip)|fd2tr1ub1|
0405|dumbbell seated shoulder press|fd2tr1ub1|
0406|dumbbell shrug|tp2fd1|
0407|dumbbell side bend|ob2ab1|
0408|dumbbell side lying one hand raise|fd2tp1ub1|
0409|dumbbell single leg calf raise|ca2|
0410|dumbbell single leg split squat|qd2gl1hm1ca1|
0411|dumbbell single leg squat|qd2gl1hm1ca1|
0413|dumbbell squat|qd2gl1hm1ca1|
0414|dumbbell standing alternate overhead press|fd2tr1ab1|
0415|dumbbell standing alternate raise|fd2tp1fa1|
0416|dumbbell standing biceps curl|bi2fa1|
0417|dumbbell standing calf raise|ca2|
0418|dumbbell standing concentration curl|bi2fa1|
0419|dumbbell standing front raise above head|fd2tp1bi1|
0420|dumbbell standing kickback|tr2fd1|
0421|dumbbell standing one arm concentration curl|bi2fa1|
0422|dumbbell standing one arm curl (over incline bench)|bi2fa1|
0423|dumbbell standing one arm extension|tr2fd1|
0424|dumbbell standing one arm palm in press|fd2tr1ab1|
0425|dumbbell standing one arm reverse curl|bi2fa1|
0426|dumbbell standing overhead press|fd2tr1ub1|
0427|dumbbell standing palms in press|fd2tr1ch1|
0428|dumbbell standing preacher curl|bi2fa1|
0429|dumbbell standing reverse curl|bi2fa1|
0430|dumbbell standing triceps extension|tr2fd1|
0431|dumbbell step-up|gl2qd1hm1ca1|
0432|dumbbell stiff leg deadlift|hm2gl1lb1|
0433|dumbbell straight arm pullover|ch2la1tr1|
0434|dumbbell straight leg deadlift|hm2gl1lb1|
0436|dumbbell tate press|tr2fd1|
0437|dumbbell upright row|sd2tp1bi1|
0438|dumbbell w-press|fd2tr1ch1|
0439|dumbbell zottman curl|bi2fa1|
0443|elbow-to-knee|ab2ob1|
0445|ez barbell anti gravity press|fd2tr1ch1|
0446|ez barbell close-grip curl|bi2fa1|
0447|ez barbell curl|bi2fa1|
0448|ez barbell decline close grip face press|tr2ch1fd1|
0449|ez barbell incline triceps extension|tr2fd1|
0450|ez barbell jm bench press|tr2ch1fd1|
0451|ez barbell reverse grip curl|bi2fa1|
0452|ez barbell reverse grip preacher curl|bi2fa1|
0453|ez barbell seated triceps extension|tr2fd1|
0454|ez barbell spider curl|bi2fa1|
0455|finger curls|fa2|
0456|flexion leg sit up (bent knee)|ab2|
0457|flexion leg sit up (straight arm)|ab2qd1|
0458|floor fly (with barbell)|ch2fd1tr1|
0459|flutter kicks|ab2gl1|
0464|front plank with twist|ob2ab1fd1|
0466|gironda sternum chin|la2bi1ub1rd1|
0467|gorilla chin|ab2fa1bi1|
0469|groin crunch|ab2ad1|
0471|handstand push-up|fd2tr1ch1ab1|
0472|hanging leg raise|ab2|
0473|hanging pike|ab2fd1|
0474|hanging straight leg hip raise|ab2|
0475|hanging straight leg raise|ab2|
0476|hanging straight twisting leg hip raise|ob2ab1|
0484|hip raise (bent knee)|ab2gl1hm1|
0488|hyperextension (on bench)|lb2gl1hm1|
0489|hyperextension|lb2gl1hm1|
0490|incline close-grip push-up|tr2ch1fd1|
0491|incline leg hip raise (leg straight)|ab2|
0492|incline push up depth jump|ch2tr1fd1ab1|
0493|incline push-up|ch2tr1fd1|
0494|incline reverse grip push-up|ch2tr1fd1|
0495|incline twisting sit-up|ob2ab1|
0496|inverse leg curl (bench support)|hm2gl1ca1|
0497|inverted row v. 2|ub2bi1fa1|
0498|inverted row with straps|ub2bi1fa1|
0499|inverted row|ub2bi1fa1|
0500|isometric wipers|ch2fd1tr1ab1|
0501|jack burpee|qd1hm1ca1fd1tr1ab1|c
0507|jackknife sit-up|ab2|
0508|janda sit-up|ab2lb1|
0513|jump squat v. 2|qd2gl1hm1ca1|
0514|jump squat|qd2gl1hm1ca1|
0517|kettlebell advanced windmill|ob2ab1fd1|
0518|kettlebell alternating hang clean|fa2fd1tp1ab1|
0519|kettlebell alternating press on floor|ch2fd1tr1|
0520|kettlebell alternating press|fd2tr1ab1|
0521|kettlebell alternating renegade row|ub2ab1fd1|
0522|kettlebell alternating row|ub2bi1fa1|
0523|kettlebell arnold press|fd2tr1ub1|
0524|kettlebell bent press|ab2fd1tr1ob1|
0525|kettlebell bottoms up clean from the hang position|bi2fa1fd1|
0526|kettlebell double alternating hang clean|bi2fa1fd1|
0527|kettlebell double jerk|fd2tr1ab1|
0528|kettlebell double push press|fd2tr1ab1|
0529|kettlebell double snatch|fd2tp1fa1ab1|
0530|kettlebell double windmill|ob2ab1fd1hm1|
0531|kettlebell extended range one arm press on floor|ch2tr1fd1|
0532|kettlebell figure 8|ab2fd1fa1|
0533|kettlebell front squat|qd2gl1hm1ca1|
0534|kettlebell goblet squat|qd2gl1hm1ca1|
0535|kettlebell hang clean|hm2gl1qd1ca1|
0536|kettlebell lunge pass through|gl2qd1hm1ca1|
0537|kettlebell one arm clean and jerk|fd2tr1ab1|
0538|kettlebell one arm jerk|fd2tr1ab1|
0539|kettlebell one arm military press to the side|fd2tr1ab1|
0540|kettlebell one arm push press|fd2tr1ab1|
0541|kettlebell one arm row|ub2bi1fa1|
0542|kettlebell one arm snatch|fd2tp1fa1ab1|
0543|kettlebell pirate supper legs|fd2tr1fa1|
0544|kettlebell pistol squat|qd2gl1hm1ca1|
0545|kettlebell plyo push-up|ch2tr1fd1ab1|
0546|kettlebell seated press|fd2tr1ab1|
0547|kettlebell seesaw press|fd2tr1ab1|
0548|kettlebell sumo high pull|tp2fd1gl1hm1|
0549|kettlebell swing|gl2hm1ab1|
0550|kettlebell thruster|fd2qd1gl1ab1|
0551|kettlebell turkish get up (squat style)|qd2gl1hm1ab1|
0552|kettlebell two arm clean|fd2tp1fa1|
0553|kettlebell two arm military press|fd2tr1ub1|
0554|kettlebell windmill|ob2ab1fd1|
0555|kick out sit|hm2qd1gl1|
0558|kipping muscle up|la2bi1tr1fd1ab1|
0562|landmine 180|ob2ab1qd1|
0570|leg pull in flat bench|ab2lb1|
0571|lever alternating narrow grip seated row|ub2bi1fa1|
0572|lever assisted chin-up|la2bi1fa1|
0573|lever back extension|lb2gl1hm1|
0574|lever bent over row|ub2bi1fa1|
0575|lever bicep curl|bi2fa1|
0576|lever chest press|ch2tr1fd1|
0577|lever chest press|ch2tr1fd1|
0578|lever deadlift|gl2hm1qd1|
0579|lever front pulldown|la2bi1ub1rd1|
0580|lever gripless shrug|tp2fd1fa1|
0581|lever high row|la2ub1bi1rd1|
0582|lever kneeling leg curl|hm2gl1|
0583|lever kneeling twist|ob2ab1lb1|
0584|lever lateral raise|sd2tp1ub1|
0585|lever leg extension|qd2hm1|
0586|lever lying leg curl|hm2ca1|
0587|lever military press|fd2tr1ch1|
0588|lever narrow grip seated row|ub2bi1fa1|
0589|lever one arm bent over row|ub2bi1fa1|
0590|lever one arm shoulder press|fd2tr1ub1|
0591|lever overhand triceps dip|tr2ch1fd1|
0592|lever preacher curl|bi2fa1|
0593|lever reverse hyperextension|gl2hm1lb1|
0594|lever seated calf raise|ca2|
0595|lever seated crunch (chest pad)|ab2ob1|
0596|lever seated fly|ch2fd1tp1|
0597|lever seated hip abduction|gl2hm1|
0598|lever seated hip adduction|ad2hm1gl1|
0599|lever seated leg curl|hm2ca1|
0600|lever seated leg raise crunch|ab2|
0601|lever seated reverse fly (parallel grip)|rd2tp1ub1|
0602|lever seated reverse fly|rd2tp1ub1|
0603|lever shoulder press|fd2tr1ch1|
0604|lever shrug|tp2fd1|
0605|lever standing calf raise|ca2|
0606|lever t bar row|ub2bi1fa1|
0607|lever triceps extension|tr2fd1|
0609|london bridge|ub2fd1bi1fa1|
0613|lying (side) quads stretch||m
0620|lying leg raise flat bench|ab2|
0624|march sit (wall)|qd2gl1hm1ca1|
0627|mixed grip chin-up|la2bi1fa1|
0628|monster walk|gl2hm1qd1|
0630|mountain climber|ab1fd1tr1|c
0631|muscle up|la2bi1tr1fd1ch1|
0634|negative crunch|ab2|
0635|oblique crunches floor|ob2ab1|
0636|olympic barbell hammer curl|bi2fa1|
0637|olympic barbell triceps extension|tr2fd1|
0638|one arm chin-up|la2bi1fa1|
0639|one arm dip|tr2ch1fd1|
0640|one arm slam (with medicine ball)|ab2fd1ub1|
0641|otis up|ab2lb1|
0642|outside leg kick push-up|ch2gl1qd1hm1ca1|
0643|overhead triceps stretch||m
0648|power clean|hm2gl1qd1ca1|
0650|pull-in (on stability ball)|ab2|
0651|pull up (neutral grip)|la2bi1fa1|
0652|pull-up|la2bi1fa1|
0653|push-up (bosu ball)|ch2tr1fd1ab1|
0655|push-up (on stability ball)|ch2tr1fd1ab1|
0656|push-up (on stability ball)|ch2tr1fd1ab1|
0658|push-up (wall) v. 2|ch2tr1fd1|
0659|push-up (wall)|ch2tr1fd1|
0660|push-up close-grip off dumbbell|tr2ch1fd1|
0661|push-up inside leg kick|ch2gl1qd1hm1ca1ab1|
0662|push-up|ch2tr1fd1ab1|
0663|push-up medicine ball|ch2tr1fd1ab1|
0664|push-up to side plank|ob2ab1fd1ch1tr1|
0666|raise single arm push-up|ch2tr1fd1ab1|
0668|rear decline bridge|gl2hm1lb1|h
0669|rear deltoid stretch||m
0670|rear pull-up|la2bi1fa1|
0672|reverse dip|tr2ch1fd1|
0673|reverse grip machine lat pulldown|la2bi1fa1|
0674|reverse grip pull-up|la2bi1fa1|
0675|reverse hyper extension (on stability ball)|gl2hm1lb1|
0677|ring dips|tr2ch1fd1|
0678|rocky pull-up pulldown|la2bi1fa1|
0680|rope climb|la2ub1fa1bi1fd1|
0684|run (equipment)|qd1hm1ca1|c
0685|run|qd1hm1ca1|c
0687|russian twist|ob2ab1|
0688|scapular pull-up|ub2tp1bi1rd1|
0689|seated leg raise|ab2|
0690|seated lower back stretch||m
0691|seated side crunch (wall)|ob2ab1|
0696|self assisted inverse leg curl (on floor)|hm2gl1ca1|
0697|self assisted inverse leg curl|hm2gl1ca1|
0699|shoulder tap push-up|ch2tr1ab1|
0705|side bridge v. 2|ob2ab1gl1|h
0709|side hip (on parallel bars)|ob2ab1|
0710|side hip abduction|gl2qd1|
0716|side push neck stretch||m
0717|side push-up|tr2fd1ch1ab1|
0720|side-to-side chin|la2bi1fa1|
0721|side wrist pull stretch||m
0725|single arm push-up|ch2tr1fd1ab1|
0727|single leg calf raise (on a dumbbell)|ca2|
0730|single leg platform slide|hm2gl1qd1|
0735|sit-up v. 2|ab2|
0738|sled 45° calf press|ca2hm1|
0739|sled 45° leg press|qd2gl1hm1ca1|
0740|sled 45° leg wide press|gl2qd1hm1ca1|
0741|sled closer hack squat|qd2gl1hm1ca1|
0742|sled forward angled calf raise|ca2hm1gl1|
0743|sled hack squat|qd2gl1hm1ca1|
0744|sled lying squat|qd2gl1hm1ca1|
0746|smith back shrug|tp2fd1|
0747|smith behind neck press|fd2tr1ub1|
0748|smith bench press|ch2tr1fd1|
0749|smith bent knee good morning|hm2gl1lb1|
0750|smith chair squat|qd2gl1hm1ca1|
0751|smith close-grip bench press|tr2ch1fd1|
0752|smith deadlift|gl2hm1qd1lb1|
0753|smith decline bench press|ch2tr1fd1|
0754|smith decline reverse-grip press|ch2tr1fd1|
0755|smith hack squat|qd2gl1hm1ca1|
0756|smith hip raise|ab2gl1hm1|
0757|smith incline bench press|ch2fd1tr1|
0758|smith incline reverse-grip press|ch2tr1fd1|
0759|smith incline shoulder raises|fd1tp1|
0760|smith leg press|qd2gl1hm1ca1|
0761|smith narrow row|ub2bi1rd1|
0762|smith rear delt row|rd2tp1ub1bi1|
0763|smith reverse calf raises|ca2hm1|
0764|smith reverse-grip press|ch2tr1fd1|
0765|smith seated shoulder press|fd2tr1ub1|
0766|smith shoulder press|fd2tr1ub1|
0767|smith shrug|tp2fd1|
0768|smith single leg split squat|qd2gl1hm1|
0769|smith sprint lunge|gl2qd1hm1ca1|
0770|smith squat|qd2gl1hm1ca1|
0771|smith standing back wrist curl|fa2bi1tr1|
0772|smith standing behind head military press|fd2tr1ub1|
0773|smith standing leg calf raise|ca2hm1gl1|
0774|smith standing military press|fd2tr1ub1|
0775|smith upright row|sd2tp1bi1|
0776|snatch pull|qd2hm1gl1ca1|
0777|spell caster|ab2ob1lb1|
0778|spider crawl push up|ch2gl1ab1fd1|
0786|squat jerk|qd2gl1hm1ca1ab1|
0788|standing behind neck press|fd2tr1ub1|
0794|standing lateral stretch||m
0795|standing single leg curl|hm2gl1|
0796|standing wheel rollerout|ab2lb1fd1|
0798|stationary bike walk|qd1hm1ca1|c
0803|superman push-up|ch2ab1fd1|
0805|suspended abdominal fallout|ab2ob1|
0806|suspended push-up|ch2tr1fd1ab1|
0807|suspended reverse crunch|ab2|
0808|suspended row|ub2bi1fd1|
0809|suspended split squat|qd2gl1hm1ca1|
0811|trap bar deadlift|gl2hm1qd1lb1|
0812|triceps dip (bench leg)|tr2ch1fd1|
0813|triceps dip (between benches)|tr2ch1fd1|
0814|triceps dip|tr2ch1fd1|
0815|triceps dips floor|tr2ch1fd1|
0816|triceps press|tr2fd1|
0817|triceps stretch||m
0818|twin handle parallel grip lat pulldown|la2bi1ub1rd1|
0826|vertical leg raise (on parallel bars)|ab2|
0830|weighted bench dip|tr2ch1fd1|
0832|weighted crunch|ab2ob1|
0833|weighted donkey calf raise|ca2hm1gl1|
0834|weighted front raise|fd2bi1fa1|
0835|weighted hyperextension (on stability ball)|lb2gl1hm1|
0840|weighted overhead crunch (on stability ball)|ab2ob1lb1|
0841|weighted pull-up|la2bi1fa1|
0844|weighted round arm|fd2tr1ub1|
0845|weighted russian twist (legs up)|ob2ab1|
0846|weighted russian twist|ob2ab1lb1|
0847|weighted seated bicep curl (on stability ball)|bi2fa1|
0849|weighted seated twist (on stability ball)|ob2ab1lb1|
0850|weighted side bend (on stability ball)|ob2ab1lb1|
0851|weighted sissy squat|qd2gl1hm1ca1|
0852|weighted squat|qd2gl1hm1ca1|
0853|weighted standing curl|bi2fa1|
0854|weighted standing hand squeeze|fa2bi1tr1|
0856|weighted svend press|ch2fd1tr1|
0857|wheel rollerout|ab2lb1|
0858|wind sprints|ab2qd1hm1ca1|c
0859|wrist rollerer|fa2bi1tr1|
0860|cable kickback|tr2fd1|
0861|cable seated row|ub2bi1fa1|
0862|cable twist (up-down)|ob2ab1lb1|
0863|dumbbell lying external shoulder rotation||m
0864|dumbbell upright shoulder external rotation|fd2tp1|
0865|lying leg-hip raise|ab2|
0866|weighted hanging leg-hip raise|ab2lb1|
0868|cable curl|bi2fa1|
0869|lever shoulder press v. 2|fd2tr1ch1|
0870|butt-ups|ab2lb1|
0871|tuck crunch|ab2|
0872|reverse crunch|ab2|
0873|cable reverse crunch|ab2|
0874|cable standing crunch (with rope attachment)|ab2ob1|
0968|band alternating biceps curl|bi2fa1|
0969|band alternating v-up|ab2|
0970|band assisted pull-up|la2bi1fa1|
0971|band assisted wheel rollerout|ab2lb1|
0972|band bicycle crunch|ab2ob1|
0974|band close-grip pulldown|la2bi1fa1|
0975|band close-grip push-up|tr2ch1fd1|
0976|band concentration curl|bi2fa1|
0977|band front lateral raise|sd2tp1ub1|
0978|band front raise|fd2tr1ub1|
0979|band horizontal pallof press|ab2ob1gl1|
0980|band bent-over hip extension|gl2hm1lb1|
0981|band jack knife sit-up|ab2|
0983|band kneeling one arm pulldown|la2bi1ub1|
0984|band lying hip internal rotation||m
0985|band kneeling twisting crunch|ob2ab1|
0986|band one arm overhead biceps curl|bi2fa1fd1|
0987|band one arm single leg split squat|qd2gl1hm1|
0988|band one arm standing low row|ub2bi1fd1|
0989|band one arm twisting chest press|ch2fd1tr1|
0990|band one arm twisting seated row|ub2bi1fd1|
0991|band pull through|gl2hm1lb1|
0992|band push sit-up|ab2fd1ch1|
0993|band reverse fly|rd2ub1tp1|
0994|band reverse wrist curl|fa2|
0996|band seated hip internal rotation|gl2hm1qd1|
0997|band shoulder press|fd2tr1ub1|
0998|band side triceps extension|tr2fd1|
0999|band single leg calf raise|ca2|
1000|band single leg reverse calf raise|ca2hm1gl1|
1001|band single leg split squat|qd2gl1hm1|
1002|band lying straight leg raise|ab2|
1003|band squat row|qd2gl1hm1ub1|
1004|band squat|qd2gl1hm1ca1|
1005|band standing crunch|ab2ob1|
1007|band standing twisting crunch|ob2ab1|
1008|band step-up|gl2qd1hm1ca1|
1009|band stiff leg deadlift|hm2gl1lb1|
1010|band straight leg deadlift|hm2lb1gl1|
1011|band seated twist|ob2ab1|
1012|band twisting overhead press|fd2tr1ub1|
1013|band underhand pulldown|la2bi1fa1|
1014|band v-up|ab2|
1015|band vertical pallof press|ab2ob1gl1|
1016|band wrist curl|fa2bi1tr1|
1017|band y-raise|fd2tp1ub1|
1018|band shrug|tp2fd1|
1022|band standing rear delt row|rd2tp1ub1bi1|
1023|band straight back stiff leg deadlift|hm2gl1lb1|
1160|burpee|qd1hm1ca1fd1ch1|c
1167|dynamic chest stretch (male)||m
1201|dumbbell burpee|qd1hm1ca1fd1tr1ab1|c
1253|lever donkey calf raise|ca2hm1gl1|
1254|band bench press|ch2tr1fd1|
1255|barbell decline pullover|ch2tr1fd1|
1256|barbell reverse grip decline bench press|ch2tr1fd1|
1257|barbell reverse grip incline bench press|ch2tr1fd1|
1258|barbell wide reverse grip bench press|ch2tr1fd1|
1259|behind head chest stretch||m
1260|cable decline one arm press|ch2tr1fd1|
1261|cable decline press|ch2tr1fd1|
1262|cable one arm decline chest fly|ch2fd1tr1|
1263|cable one arm fly on exercise ball|ch2fd1tr1|
1264|cable one arm incline fly on exercise ball|ch2fd1tr1|
1265|cable one arm incline press|ch2fd1tr1|
1266|cable one arm incline press on exercise ball|ch2fd1tr1|
1267|cable one arm press on exercise ball|ch2fd1tr1|
1268|cable press on exercise ball|ch2fd1tr1|
1269|cable standing up straight crossovers|ch2fd1tr1|
1270|cable upper chest crossovers|ch2fd1tr1|
1271|chest and front of shoulder stretch||m
1272|chest stretch with exercise ball||m
1273|clap push up|ch2tr1fd1|
1274|deep push up|ch2tr1fd1|
1275|drop push up|ch2tr1fd1|
1276|dumbbell decline one arm fly|ch2fd1|
1277|dumbbell fly on exercise ball|ch2fd1tr1|
1278|dumbbell incline fly on exercise ball|ch2fd1|
1279|dumbbell incline one arm fly|ch2fd1tr1|
1280|dumbbell incline one arm fly on exercise ball|ch2fd1|
1281|dumbbell incline one arm press|ch2fd1tr1|
1282|dumbbell incline one arm press on exercise ball|ch2fd1tr1|
1283|dumbbell incline press on exercise ball|ch2fd1tr1|
1284|dumbbell lying pullover on exercise ball|ch2tr1fd1ub1|
1285|dumbbell one arm bench fly|ch2fd1|
1286|dumbbell one arm chest fly on exercise ball|ch2fd1tr1|
1287|dumbbell one arm decline chest press|ch2tr1fd1|
1288|dumbbell one arm fly on exercise ball|ch2fd1tr1|
1289|dumbbell one arm incline chest press|ch2fd1tr1|
1290|dumbbell one arm press on exercise ball|ch2fd1tr1ab1|
1291|dumbbell one arm pullover on exercise ball|ch2tr1la1ub1|
1292|dumbbell one leg fly on exercise ball|ch2fd1tr1|
1293|dumbbell press on exercise ball|ch2fd1tr1|
1294|dumbbell pullover hip extension on exercise ball|ch2tr1fd1ab1|
1295|dumbbell pullover on exercise ball|ch2tr1la1|
1296|exercise ball pike push up|fd2ch1tr1ab1|
1297|isometric chest squeeze|ch2tr1fd1|h
1298|kettlebell one arm floor press|ch2tr1fd1|
1299|lever incline chest press|ch2fd1tr1|
1300|lever decline chest press|ch2tr1fd1|
1301|machine inner chest press|ch2tr1fd1|
1302|medicine ball chest pass|ch2fd1tr1|
1303|medicine ball chest push from 3 point stance|ch2fd1tr1|
1304|medicine ball chest push multiple response|ch2tr1fd1|
1305|medicine ball chest push single response|ch2tr1fd1|
1306|plyo push up|ch2tr1fd1ab1|
1307|push up on bosu ball|ch2tr1fd1ab1|
1308|smith wide grip bench press|ch2tr1fd1|
1309|smith wide grip decline bench press|ch2tr1fd1|
1310|weighted drop push up|ch2tr1fd1|
1311|wide hand push up|ch2tr1fd1|
1312|medicine ball chest push with run release|ch2tr1fd1ab1|
1313|lever unilateral row|ub2bi1fa1|
1314|back extension on exercise ball|lb2gl1hm1|
1316|barbell bent arm pullover|la2tr1ch1|
1317|barbell reverse grip incline bench row|ub2bi1fa1|
1318|cable incline bench row|ub2bi1rd1|
1319|cable palm rotational row|ub2bi1fa1|
1320|cable rope crossover seated row|ub2bi1fa1|
1321|cable rope elevated seated row|ub2bi1fa1|
1322|cable rope extension incline bench row|ub2bi1fd1|
1323|cable rope seated row|ub2bi1fa1|
1324|cable upper row|ub2bi1fd1|
1325|cable wide grip rear pulldown behind neck|la2bi1ub1rd1|
1326|chin-up|la2bi1fa1|
1327|close grip chin-up|la2bi1fa1|
1328|dumbbell lying rear delt row|rd2ub1bi1|
1329|dumbbell palm rotational bent over row|ub2bi1fa1|
1330|dumbbell reverse grip incline bench one arm row|ub2bi1fd1|
1331|dumbbell reverse grip incline bench two arm row|ub2bi1fa1|
1332|exercise ball alternating arm ups|la2fd1ab1|
1333|exercise ball back extension with arms extended|lb2gl1hm1|
1334|exercise ball back extension with hands behind head|lb2gl1hm1|
1335|exercise ball back extension with knees off ground|lb2gl1hm1|
1336|exercise ball back extension with rotation|lb2gl1hm1|
1338|exercise ball hug||m
1339|exercise ball lat stretch||m
1341|exercise ball lower back stretch (pyramid)||m
1342|exercise ball lying side lat stretch||m
1343|exercise ball prone leg raise|lb2ab1gl1|
1344|ez bar reverse grip bent over row|ub2bi1fa1|
1345|kettlebell two arm row|ub2bi1fa1|
1346|kneeling lat stretch||m
1347|lever one arm lateral wide pulldown|la2bi1ub1rd1|
1348|lever reverse grip vertical row|ub2bi1fa1|
1349|lever reverse t-bar row|ub2bi1fa1|
1350|lever seated row|ub2bi1fa1|
1351|lever t-bar reverse grip row|ub2bi1fa1|
1352|lower back curl|lb2gl1hm1|
1353|medicine ball catch and overhead throw|la2fd1ab1|
1354|medicine ball overhead slam|ub2fd1ab1|
1355|one arm against wall|la2fd1tr1|
1356|lever one arm lateral high row|la2ub1bi1sd1|
1358|side lying floor stretch||m
1359|smith bent over row|ub2bi1fa1|
1360|smith one arm row|ub2bi1fa1|
1361|smith reverse grip bent over row|ub2bi1fa1|
1362|sphinx||m
1363|spine stretch||m
1364|standing pelvic tilt||m
1365|upper back stretch||m
1366|upward facing dog||m
1367|wide grip rear pull-up|la2bi1fa1|
1368|ankle circles||m
1369|band two legs calf raise - (band under both legs) v. 2|ca2|
1370|barbell floor calf raise|ca2hm1|
1371|barbell seated calf raise|ca2hm1|
1372|barbell standing calf raise|ca2hm1gl1|
1373|bodyweight standing calf raise|ca2|
1374|box jump down with one leg stabilization|ca2qd1hm1gl1|
1375|cable standing calf raise|ca2hm1gl1|
1376|cable standing one leg calf raise|ca2|
1377|calf stretch with hands against wall||m
1378|calf stretch with rope||m
1379|dumbbell seated calf raise|ca2hm1|
1380|dumbbell seated one leg calf raise - hammer grip|ca2hm1gl1|
1381|dumbbell seated one leg calf raise - palm up|ca2hm1gl1|
1382|exercise ball on the wall calf raise|ca2hm1qd1|
1383|hack calf raise|ca2hm1gl1|
1384|hack one leg calf raise|ca2hm1gl1|
1385|lever seated squat calf raise on leg press machine|ca2qd1hm1gl1|
1386|one leg donkey calf raise|ca2hm1gl1|
1387|one leg floor calf raise|ca2|
1388|peroneals stretch||m
1389|posterior tibialis stretch||m
1390|seated calf stretch (male)||m
1391|sled calf press on leg press|ca2hm1qd1|
1392|sled one leg calf press on leg press|ca2hm1gl1|
1393|smith one leg floor calf raise|ca2hm1gl1|
1394|smith reverse calf raises|ca2hm1|
1395|smith seated one leg calf raise|ca2hm1|
1396|smith toe raise|ca1|
1397|standing calves|ca2hm1gl1|
1398|standing calves calf stretch||m
1399|bench dip on floor|tr2ch1fd1|
1401|muscle-up (on vertical bar)|la2bi1tr1fa1|
1403|neck side stretch||m
1405|back pec stretch||m
1407|calf push stretch with hands against wall||m
1408|band hip lift|gl2hm1qd1|
1409|barbell glute bridge|gl2hm1lb1|
1410|barbell lateral lunge|gl2qd1hm1ca1|
1411|barbell palms down wrist curl over a bench|fa2bi1|
1412|barbell palms up wrist curl over a bench|fa2bi1fd1|
1413|cable reverse one arm curl|bi2fa1|
1414|dumbbell one arm reverse preacher curl|bi2fa1|
1415|dumbbell one arm seated neutral wrist curl|fa2bi1|
1416|exercise ball one leg prone lower body rotation|gl2hm1qd1ab1|
1417|exercise ball one legged diagonal kick hamstring curl|hm2gl1ca1|
1418|hug keens to chest||m
1419|iron cross stretch||m
1420|kneeling jump squat|qd2gl1hm1ca1|
1421|modified push up to lower arms|fa2tr1ch1fd1|
1422|pelvic tilt into bridge||m
1423|reverse hyper on flat bench|gl2hm1lb1|
1424|seated glute stretch||m
1425|sled 45 degrees one leg press|qd2gl1hm1ca1|
1426|smith seated wrist curl|fa2bi1|
1427|straight leg outer hip abductor|gl2hm1|
1428|wrist circles||m
1429|wide grip pull-up|la2bi1fa1|
1430|chest dip (on dip-pull-up cage)|ch2tr1fd1|
1431|assisted standing chin-up|la2bi1fa1|
1432|assisted standing pull-up|la2bi1fa1|
1433|smith front squat (clean grip)|qd2gl1hm1ca1ab1|
1434|smith low bar squat|qd2gl1hm1ca1|
1435|barbell low bar squat|qd2gl1hm1ca1|
1436|barbell high bar squat|qd2gl1hm1ca1ab1|
1437|dumbbell finger curls|fa2|
1438|kettlebell seated two arm military press|fd2tr1ub1|
1439|lever gripless shrug v. 2|tp2fd1fa1|
1441|dumbbell over bench one arm reverse wrist curl|fa2bi1|
1451|lever seated dip|tr2ch1fd1|
1452|lever seated crunch|ab2ob1|
1456|barbell standing close grip military press|fd2tr1ub1|
1457|barbell standing wide military press|fd2tr1ub1|
1458|ez barbell seated curls|bi2fa1|
1459|dumbbell romanian deadlift|hm2gl1lb1|
1460|walking lunge|gl2qd1hm1ca1|
1461|barbell full squat (back pov)|qd2gl1hm1ca1ab1|
1462|barbell full squat (side pov)|qd2gl1hm1ca1ab1|
1463|sled 45° leg press (side pov)|qd2gl1hm1ca1|
1464|sled 45° leg press (back pov)|qd2gl1hm1ca1|
1466|twist hip lift|gl2ob1hm1|
1467|push-up on lower arms|tr2ch1fd1|
1468|crab twist toe touch|ob2ab1|
1471|inchworm|ab2fd1hm1|
1472|forward jump|qd2ca1hm1gl1|
1473|backward jump|qd2hm1gl1ca1|
1476|one leg squat|qd2gl1hm1ca1|
1479|lever incline chest press v. 2|ch2tr1fd1|
1489|sissy squat|qd2ca1gl1|
1490|standing calf raise (on a staircase)|ca2|
1494|butterfly yoga pose||m
1495|oblique crunch v. 2|ob2ab1|
1496|sledge hammer|ab2fa1fd1|
1511|hamstring stretch||m
1512|all fours squad stretch||m
1545|barbell full zercher squat|qd2gl1hm1ca1ab1|
1548|chair leg extended stretch||m
1559|exercise ball hip flexor stretch||m
1560|exercise ball seated hamstring stretch||m
1564|intermediate hip flexor and quad stretch||m
1576|leg up hamstring stretch||m
1582|reclining big toe pose with rope||m
1585|runners stretch||m
1587|seated wide angle pose sequence||m
1599|standing hamstring and calf stretch with strap||m
1604|world greatest stretch||m
1614|lever preacher curl v. 2|bi2fa1|
1615|lever hammer grip preacher curl|bi2fa1|
1616|lever reverse grip preacher curl|bi2fa1|
1617|dumbbell decline one arm hammer press|ch2tr1fd1|
1618|dumbbell incline hammer press on exercise ball|ch2tr1fd1|
1619|dumbbell incline one arm hammer press|ch2tr1fd1|
1620|dumbbell incline one arm hammer press on exercise ball|ch2tr1fd1|
1621|dumbbell one arm hammer press on exercise ball|ch2tr1fd1|
1622|dumbbell one arm reverse grip press|ch2tr1fd1|
1623|dumbbell palms in incline bench press|ch2tr1fd1|
1624|dumbbell reverse bench press|ch2tr1fd1|
1625|smith machine decline close grip bench press|tr2ch1fd1|
1626|smith machine reverse decline close grip bench press|ch2tr1fd1|
1627|ez barbell close grip preacher curl|bi2fa1|
1628|ez barbell spider curl|bi2fa1|
1629|barbell standing wide grip biceps curl|bi2fa1|
1630|cable close grip curl|bi2fa1|
1631|cable concentration curl|bi2fa1|
1632|cable drag curl|bi2fa1|
1633|cable one arm preacher curl|bi2fa1|
1634|cable lying bicep curl|bi2fa1|
1635|cable one arm reverse preacher curl|bi2fa1|
1636|cable overhead curl|bi2fa1fd1|
1637|cable overhead curl on exercise ball|bi2fa1fd1|
1638|cable pulldown bicep curl|bi2fa1|
1639|cable rope hammer preacher curl|bi2fa1|
1640|cable rope one arm hammer preacher curl|bi2fa1|
1641|cable seated curl|bi2fa1|
1642|cable seated one arm concentration curl|bi2fa1|
1643|cable seated overhead curl|bi2fa1fd1|
1644|cable squatting curl|bi2fa1|
1645|cable two arm curl on incline bench|bi2fa1|
1646|dumbbell alternate hammer preacher curl|bi2fa1|
1647|dumbbell alternate preacher curl|bi2fa1|
1648|dumbbell alternate seated hammer curl|bi2fa1|
1649|dumbbell alternating bicep curl with leg raised on exercise ball|bi2fa1fd1|
1650|dumbbell alternating seated bicep curl on exercise ball|bi2fa1|
1651|dumbbell bicep curl lunge with bowling motion|bi2fa1fd1|
1652|dumbbell bicep curl on exercise ball with leg raised|bi2fa1fd1|
1653|dumbbell bicep curl with stork stance|bi2fa1|
1654|dumbbell biceps curl reverse|bi2fa1|
1655|dumbbell biceps curl squat|bi2fa1|
1656|dumbbell biceps curl v sit on bosu ball|bi2fa1fd1|
1657|dumbbell cross body hammer curl v. 2|bi2fa1|
1658|dumbbell lunge with bicep curl|bi2qd1hm1|
1659|dumbbell hammer curl on exercise ball|bi2fa1|
1660|dumbbell kneeling bicep curl exercise ball|bi2fa1|
1661|dumbbell lying supine biceps curl|bi2fa1|
1662|dumbbell lying wide curl|bi2fa1|
1663|dumbbell one arm hammer preacher curl|bi2fa1|
1664|dumbbell high curl|bi2fa1|
1665|dumbbell one arm prone curl|bi2fa1|
1666|dumbbell one arm prone hammer curl|bi2fa1|
1667|dumbbell one arm reverse spider curl|bi2fa1|
1668|dumbbell one arm seated bicep curl on exercise ball|bi2fa1|
1669|dumbbell one arm seated hammer curl|bi2fa1|
1670|dumbbell one arm standing curl|bi2fa1|
1671|dumbbell one arm standing hammer curl|bi2fa1|
1672|dumbbell one arm zottman preacher curl|bi2fa1|
1673|dumbbell preacher curl over exercise ball|bi2fa1|
1674|dumbbell prone incline hammer curl|bi2fa1|
1675|dumbbell reverse spider curl|bi2fa1|
1676|dumbbell seated alternate hammer curl on exercise ball|bi2fa1|
1677|dumbbell seated bicep curl|bi2fa1|
1678|dumbbell seated hammer curl|bi2fa1|
1679|dumbbell seated one arm bicep curl on exercise ball with leg raised|bi2fa1fd1|
1680|dumbbell standing one arm curl over incline bench|bi2fa1|
1682|ez bar seated close grip concentration curl|bi2fa1|
1683|smith machine bicep curl|bi2fa1|
1684|dumbbell step up single leg balance with bicep curl|bi2qd1gl1hm1|
1685|squat to overhead reach|qd2gl1hm1ab1|
1686|squat to overhead reach with twist|qd2gl1hm1ab1|
1687|posterior step to overhead reach||m
1688|lunge with twist|ob2ab1qd1gl1hm1|
1689|push and pull bodyweight|ch2tr1fd1|
1700|dumbbell push press|fd2tr1ab1|
1701|medicine ball close grip push up|tr2ch1fd1|
1705|squat on bosu ball|qd2gl1hm1ca1|
1707|prone twist on stability ball|ob2ab1lb1|
1708|assisted lying calves stretch||m
1709|assisted lying glutes stretch||m
1710|assisted lying gluteus and piriformis stretch||m
1712|assisted side lying adductor stretch||m
1713|assisted prone lying quads stretch||m
1714|assisted prone rectus femoris stretch||m
1716|assisted seated pectoralis major stretch with stability ball||m
1717|cable squat row (with rope attachment)|ub2la1bi1rd1|
1718|barbell seated close grip behind neck triceps extension|tr2fd1|
1719|barbell incline close grip bench press|tr2ch1fd1|
1720|barbell lying back of the head tricep extension|tr2fd1|
1721|barbell reverse grip skullcrusher|tr2fa1|
1722|cable high pulley overhead tricep extension|tr2fd1|
1723|cable one arm tricep pushdown|tr2fa1|
1724|cable rope high pulley overhead tricep extension|tr2fd1|
1725|cable rope incline tricep extension|tr2fd1|
1726|cable rope lying on floor tricep extension|tr2fd1|
1727|cable standing reverse grip one arm overhead tricep extension|tr2fd1|
1728|cable two arm tricep kickback|tr2fd1|
1729|dumbbell lying alternate extension|tr2fd1|
1730|dumbbell seated bent over alternate kickback|tr2fd1ub1|
1731|dumbbell close grip press|tr2ch1fd1|
1732|dumbbell forward lunge triceps extension|tr2fd1ab1|
1733|dumbbell incline two arm extension|tr2fd1|
1734|dumbbell kickbacks on exercise ball|tr2fd1ub1|
1735|dumbbell lying single extension|tr2fd1|
1736|dumbbell one arm french press on exercise ball|tr2fd1|
1737|dumbbell seated bent over triceps extension|tr2fd1ub1|
1738|dumbbell seated reverse grip one arm overhead tricep extension|tr2fd1|
1739|dumbbell standing alternating tricep kickback|tr2fd1|
1740|dumbbell standing bent over one arm triceps extension|tr2fd1ub1|
1741|dumbbell standing bent over two arm triceps extension|tr2fd1ub1|
1742|dumbbell tricep kickback with stork stance|tr2fd1|
1743|dumbbell twisting bench press|ch2tr1fd1|
1744|exercise ball dip|tr2ch1fd1|
1745|exercise ball seated triceps stretch||m
1746|exercise ball supine triceps extension|tr2fd1|
1747|ez bar french press on exercise ball|tr2fd1|
1748|ez bar lying close grip triceps extension behind head|tr2fd1|
1749|ez bar standing french press|tr2fd1|
1750|medicine ball supine chest throw|tr2ch1fd1|
1751|barbell pin presses|tr2fd1|
1752|smith machine incline tricep extension|tr2fd1|
1753|three bench dip|tr2ch1fd1|
1754|weighted three bench dips|tr2ch1fd1|
1755|weighted tricep dips|tr2ch1fd1|
1756|barbell single leg deadlift|hm2gl1lb1|
1757|dumbbell single leg deadlift|hm2gl1lb1|
1758|assisted sit-up|ab2|
1759|single leg squat (pistol) male|qd2gl1hm1ca1|
1760|dumbbell goblet squat|qd2gl1hm1ca1|
1761|hanging oblique knee raise|ob2ab1|
1763|shoulder grip pull-up|la2bi1fa1|
1764|hanging leg hip raise|ab2lb1|
1765|dumbbell upright row (back pov)|sd2tp1bi1|
1766|self assisted inverse leg curl|hm2gl1ca1|
1767|weighted triceps dip on high parallel bars|tr2ch1fd1|
1769|bodyweight side lying biceps curl|bi2fa1|
1770|biceps leg concentration curl|bi2fa1|
1771|bodyweight kneeling triceps extension|tr2fd1ch1|
1772|elbow lift - reverse push-up|ub2tr1fd1|
1773|one arm towel row|ub2bi1fa1|
1774|side bridge hip abduction|gl2ob1|
1775|side plank hip adduction|ad2ob1gl1|
2133|farmers walk|fa2qd1ca1ab1|
2135|weighted front plank|ab2fd1lb1|h
2136|dumbbell cuban press v. 2|fd2tr1ub1|
2137|dumbbell arnold press|fd2tr1ch1|
2138|stationary bike run v. 3|qd1hm1ca1|c
2139|hands bike|ch1tr1fd1|c
2141|walk elliptical cross trainer|qd1hm1gl1ca1|c
2142|ski ergometer|tr1fd1fa1|c
2143|dumbbell standing around world|fd2tr1fa1|
2144|cable seated chest press|ch2fd1tr1|
2186|ez barbell decline triceps extension|tr2fd1|
2187|barbell reverse close-grip bench press|tr2ch1fd1|
2188|dumbbell seated triceps extension|tr2fd1|
2189|dumbbells seated triceps extension|tr2fd1|
2202|roller hip stretch||m
2203|roller seated shoulder flexor depresor retractor||m
2204|roller body saw|ab2fd1tr1|
2205|roller hip lat stretch||m
2206|roller reverse crunch|ab2|
2207|roller side lat stretch||m
2208|roller back stretch||m
2209|roller seated single leg shoulder flexor depresor retractor||m
2271|left hook. boxing|fd2bi1tr1fa1|
2285|lever pullover|la2tr1fd1|
2286|lever hip extension v. 2|gl2hm1|
2287|lever alternate leg press|qd2hm1gl1|
2288|lever gripper hands|fa2bi1tr1|
2289|lever calf press|ca2hm1|
2292|dumbbell rear delt raise|rd2tp1ub1|
2293|dumbbell standing zottman preacher curl|bi2fa1|
2294|dumbbell zottman preacher curl|bi2fa1|
2297|stability ball crunch (full range hands behind head)|ab2|
2298|inverted row on bench|ub2bi1fa1|
2300|inverted row bent knees|ub2bi1fa1|
2311|walking on stepmill|qd1hm1gl1ca1|c
2312|lying elbow to knee|ab2lb1|
2315|lever rotary calf|ca2|
2317|dumbbell seated bent arm lateral raise|sd2tp1ub1|
2318|lever shoulder press v. 3|fd2tr1ch1|
2321|dumbbell standing inner biceps curl v. 2|bi2fa1|
2327|dumbbell reverse grip row (female)|ub2bi1fa1|
2328|narrow push-up on exercise ball|tr2ch1fd1|
2329|spine twist||m
2330|cable lat pulldown full range of motion|la2bi1ub1rd1|
2331|cycle cross trainer|qd1hm1gl1|c
2333|arm slingers hanging straight legs|ab2fd1ub1|
2334|sled lying calf press|ca2hm1gl1|
2335|lever seated calf press|ca2hm1|
2355|arm slingers hanging bent knee legs|ab2fd1ub1|
2363|wide-grip chest dip on high parallel bars|ch2tr1fd1|
2364|assisted wide-grip chest dip (kneeling)|ch2tr1fd1|
2368|split squats|qd2gl1hm1ca1|
2371|weighted russian twist v. 2|ob2ab1lb1|
2397|dumbbell scott press|fd2tr1ch1|
2398|close-grip push-up (on knees)|tr2ch1fd1|
2399|cable seated twist|ob2ab1|
2400|inverse leg curl (on pull-up cable machine)|hm2gl1ca1|
2401|dumbbell biceps curl (with arm blaster)|bi2fa1|
2402|dumbbell hammer curls (with arm blaster)|bi2fa1|
2403|dumbbell alternate biceps curl (with arm blaster)|bi2fa1|
2404|ez-bar biceps curl (with arm blaster)|bi2fa1|
2405|cable triceps pushdown (v-bar) (with arm blaster)|tr2fa1|
2406|cable reverse grip triceps pushdown (sz-bar) (with arm blaster)|tr2fa1|
2407|barbell biceps curl (with arm blaster)|bi2fa1|
2414|barbell standing concentration curl|bi2fa1|
2429|frog crunch|ab2|
2432|ez-bar close-grip bench press|tr2ch1fd1|
2459|tire flip|gl2hm1qd1ab1|
2462|chest dip on straight bar|ch2tr1fd1|
2464|cable thibaudeau kayak row|la2bi1ub1rd1|
2466|bridge - mountain climber (cross body)|ab2gl1qd1hm1fd1tr1|
2470|dumbbell lying on floor rear delt raise|rd2tp1ub1|
2567|seated piriformis stretch||m
2571|rocking frog stretch||m
2611|lever horizontal one leg press|qd2gl1hm1ca1|
2612|jump rope|ca1qd1hm1gl1|c
2616|cable lateral pulldown with v-bar|la2bi1fa1|
2705|dumbbell lying pronation on floor|fa2bi1tr1|
2706|dumbbell lying supination on floor|fa2bi1fd1|
2736|lever reverse grip lateral pulldown|la2bi1ub1rd1|
2741|ez-barbell standing wide grip biceps curl|bi2fa1|
2796|dumbbell step-up lunge|gl2qd1hm1ca1|
2798|barbell squat jump step rear lunge|gl2qd1hm1ca1|
2799|barbell sitted alternate leg raise|ab2|
2800|barbell sitted alternate leg raise (female)|ab2qd1|
2801|twisted leg raise (female)|ob2ab1|
2802|twisted leg raise|ob2ab1|
2803|dumbbell supported squat|qd2gl1hm1ca1|
2805|dumbbell single leg deadlift with stepbox support|hm2gl1lb1|
2808|dumbbell sumo pull through|gl2hm1qd1ab1|
2810|barbell split squat v. 2|qd2gl1hm1ca1|
2812|dumbbell step-up split squat|gl2qd1hm1ca1|
2963|captains chair straight leg raise|ab2|
2987|weighted close grip chin-up on dip cage|la2bi1fa1|
3006|resistance band seated hip abduction|gl2hm1|
3007|resistance band leg extension|qd2hm1|
3010|ez bar lying bent arms pullover|la2tr1ch1|
3011|incline scapula push up|tr1fd1|
3012|scapula dips|ub2tp1fd1|
3013|low glute bridge on floor|gl2hm1ab1|
3016|curl-up|ab2|
3017|barbell pendlay row|ub2bi1fa1|
3019|bench pull-ups|la2bi1fa1|
3021|scapula push-up|tr1fd1|
3116|band fixed back underhand pulldown|la2bi1ub1rd1|
3117|band fixed back close grip pulldown|la2bi1fa1|
3119|potty squat|ab2qd1gl1|
3122|resistance band seated shoulder press|fd2tr1ub1|
3123|resistance band seated biceps curl|bi2fa1|
3124|resistance band seated chest press|ch2fd1tr1|
3132|potty squat with support|qd2gl1hm1ca1|
3142|smith sumo squat|gl2qd1hm1ca1|
3144|resistance band seated straight back row|ub2bi1fd1|
3145|push-up plus|ch2tr1fd1|
3147|pelvic tilt||m
3156|bodyweight standing close-grip one arm row|ub2bi1fa1|
3158|bodyweight standing close-grip row|ub2bi1fa1|
3161|bodyweight standing one arm row (with towel)|ub2bi1fa1|
3162|bodyweight standing one arm row|ub2bi1fa1|
3165|bodyweight standing row (with towel)|ub2bi1fd1|
3166|bodyweight standing row|ub2bi1fd1|
3167|bodyweight squatting row (with towel)|ub2bi1fd1|
3168|bodyweight squatting row|ub2bi1fd1|
3193|glute-ham raise|hm2gl1lb1|
3194|frankenstein squat|qd2gl1hm1ca1|
3195|lever lying two-one leg curl|hm2gl1|
3200|lever bent-over row with v-bar|ub2bi1fa1|
3201|quarter sit-up|ab2|
3202|half sit-up (male)|ab2|
3203|prisoner half sit-up (male)|ab2|
3204|arms overhead full sit-up (male)|ab2lb1|
3211|kneeling push-up (male)|ch2tr1fd1|
3212|basic toe touch (male)||m
3213|side-to-side toe touch (male)||m
3214|arms apart circular toe touch (male)||m
3215|hands reversed clasped circular toe touch (male)||m
3216|chest tap push-up (male)|ch2tr1fd1|
3217|modified hindu push-up (male)|ch2tr1fd1ab1|
3218|hands clasped circular toe touch (male)||m
3219|scissor jumps (male)|qd1hm1ca1|c
3220|astride jumps (male)|qd1hm1ca1|c
3221|half knee bends (male)|qd1hm1gl1|c
3222|semi squat jump (male)|qd1hm1ca1|c
3223|star jump (male)|qd1hm1ca1|c
3224|jack jump (male)|qd1ca1|c
3231|two toe touch (male)||m
3234|hyght dumbbell fly|ch2fd1|
3235|cable assisted inverse leg curl|hm2gl1ca1|
3236|resistance band hip thrusts on knees (female)|gl2hm1qd1|
3237|landmine lateral raise|sd2tp1ub1|
3239|kneeling plank tap shoulder (male)|ab2fd1tr1|
3240|exercise ball on the wall calf raise (tennis ball between knees)|ca2qd1hm1|
3241|exercise ball on the wall calf raise (tennis ball between ankles)|ca2hm1qd1|
3281|smith full squat|qd2gl1hm1ca1|
3286|weighted muscle up|la2bi1tr1fd1ch1|
3287|elbow dips|tr2ch1fd1|
3288|korean dips|ch2tr1fd1|
3289|impossible dips|tr2ch1fd1|
3290|weighted one hand pull up|la2bi1fa1|
3291|stalder press|tr2fd1ab1|
3292|elevator|ub2fd1tp1|
3293|archer pull up|la2bi1fa1|
3294|archer push up|ch2tr1fd1ab1|
3295|front lever reps|ub2ab1fd1|
3296|front lever|ab2la1fd1fa1|h
3297|back lever|ub2bi1fa1ab1|h
3298|straddle planche|ab2fd1tr1ch1|h
3299|full planche|ab2fd1ch1tr1|h
3300|lean planche|ab2fd1ch1tr1|h
3301|frog planche|ab2fd1ch1tr1|h
3302|handstand|fd2tr1ab1|h
3303|flag|ab2ob1fd1|h
3304|skin the cat||m
3305|barbell thruster|fd2qd1gl1hm1ab1|
3312|weighted muscle up (on bar)|la2bi1tr1fd1fa1|
3313|weighted straight bar dip|ch2tr1fd1|
3314|straddle maltese|ab2fd1ch1|h
3315|full maltese|ab2fd1ch1|h
3318|swing 360|fd1ab1|c
3327|full planche push-up|ch2fd1tr1ab1|
3360|bear crawl|ab1fd1tr1|c
3361|skater hops|qd1hm1gl1ca1|c
3418|l-pull-up|la2bi1fa1|
3419|l-sit on floor|ab2|h
3420|v-sit on floor|ab2|h
3433|swimmer kicks v. 2 (male)|gl2hm1qd1ca1|
3470|forward lunge (male)|gl2qd1hm1ca1|
3523|glute bridge two legs on bench (male)|gl2hm1ab1|
3533|quads|qd2hm1gl1|
3541|dumbbell incline y-raise|ub2fd1rd1|
3542|dumbbell incline t-raise|fd2tp1ub1|
3543|bodyweight drop jump squat|qd2gl1hm1ca1|
3544|bodyweight incline side plank|ob2ab1fd1|h
3545|dumbbell incline alternate press|ch2fd1tr1|
3546|dumbbell seated alternate shoulder|fd2tr1ub1|
3547|dumbbell seated biceps curl to shoulder press|bi2fd1|
3548|dumbbell single arm overhead carry|fd2tp1ab1|
3552|quick feet v. 2|qd2ca1hm1|c
3560|dumbbell standing alternate hammer curl and press|bi2fa1fd1|
3561|glute bridge march|gl2hm1qd1|
3562|barbell glute bridge two legs on bench (male)|gl2hm1ab1|
3563|cable one arm pulldown|la2bi1fa1|
3582|lunge with jump|gl2qd1hm1ca1|
3635|dumbbell contralateral forward lunge|gl2qd1hm1ca1|
3636|high knee against wall|qd1hm1gl1ca1|c
3637|wheel run|qd1hm1ca1|c
3638|push to run|qd1hm1ca1|c
3639|bent knee lying twist (male)||m
3640|knee touch crunch|ab2|
3641|weighted kneeling step with swing|fd2tr1ab1|
3642|weighted stretch lunge|gl2qd1hm1ca1|
3643|weighted cossack squats (male)|qd2gl1hm1ca1|
3644|weighted lunge with swing|gl2qd1hm1ca1|
3645|single leg bridge with outstretched leg|gl2hm1qd1|
3655|walking high knees lunge|qd1hm1gl1ca1|c
3656|short stride run|qd1hm1ca1|c
3662|pike-to-cobra push-up|ch2gl1ab1fd1tr1|
3663|reverse plank with leg lift|ab2gl1hm1fd1|
3664|dumbbell side plank with rear fly|rd2ub1ab1|
3665|power point plank|ab2fd1tr1gl1|
3666|walking on incline treadmill|qd1hm1ca1|c
3667|side lying hip adduction (male)|ad2gl1hm1|
3669|standing archer||m
3670|weighted decline sit-up|ab2lb1|
3671|ski step|qd1hm1gl1ca1|c
3672|back and forth step|qd1hm1gl1ca1|c
3679|sit-up with arms on chest|ab2|
3697|cable kneeling rear delt row (with rope) (male)|rd2tp1ub1bi1|
3698|inchworm v. 2|ab2fd1hm1|
3699|shoulder tap|ab2fd1tr1|
3758|lever standing chest press|ch2fd1tr1|
3759|lever seated good morning|hm2gl1lb1|
3760|lever seated crunch v. 2|ab2ob1|
3769|curtsey squat|gl2qd1hm1ca1|
3785|incline push-up (on box)|ch2tr1fd1|
3888|dumbbell one arm snatch|gl2hm1qd1ab1|
5201|dumbbell waiter biceps curl|bi2fa1fd1|
`;
// Parsed once, on first use: number -> { n: name, hits: { muscle: 1 or 0.5 }, kind }.
let ogIndex = null;
function ogx(id) {
  if (!ogIndex) {
    ogIndex = new Map();
    for (const line of OG_LIST.split('\n')) {
      const [i, n, m, k] = line.split('|');
      if (!n) continue;
      const hits = {};
      for (const [, c, v] of (m || '').matchAll(/([a-z]{2})([12])/g)) if (OG_MUS[c]) hits[OG_MUS[c]] = v === '2' ? 1 : 0.5;
      ogIndex.set(i, { n: n.charAt(0).toUpperCase() + n.slice(1), hits, kind: k || '' });
    }
  }
  return ogIndex.get(String(id)) || null;
}
// Loaded: this file ran to the end.
(self.LOADED ||= []).push('opengym-ids.js');
